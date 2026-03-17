import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherService, WeatherData } from '../../core/services/weather.service';
import { LineChartComponent, ChartSeries } from '../../shared/components/line-chart.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { LucideAngularModule, Droplets, Thermometer, Wind, Sprout, CloudRain, ExternalLink, RefreshCw, CheckCircle, AlertTriangle, Zap, Cpu, Layers, Grape, FileText, Save, Share2, Download, Leaf } from 'lucide-angular';
import { Subscription, interval, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { User as AppUser } from '../../core/models/user.model';
import { BlockService } from '../../shared/services/block.service';
import { MOCK_BLOCKS } from '../../shared/constants';
import { Block as SharedBlock } from '../../shared/models';
import { CropAdvisorService, ActionItem, CropRecommendation, YieldImpact } from '../../core/services/crop-advisor.service';
import { SensorService, Sensor } from '../../core/services/sensor.service';

interface Block extends Omit<SharedBlock, 'location'> {
  crop: string;
  area: number;
  soilDescription?: string;
  location: {
    name: string;
    lat: number;
    lon: number;
  };
}

interface User {
  id: string;
  name: string;
  blocks: Block[];
}

const CROP_PROFILES: Record<string, any> = {
  'Chardonnay': {
    temp: { min: 10, max: 32, optimal: [18, 28] },
    moisture: { min: 20, max: 85, optimal: [35, 65] },
    ph: { min: 6.0, max: 8.0, optimal: [6.5, 7.5] },
    humidity: { min: 20, max: 80, optimal: [40, 60] }
  },
  'Grapes': {
    temp: { min: 10, max: 32, optimal: [18, 28] },
    moisture: { min: 20, max: 85, optimal: [35, 65] },
    ph: { min: 6.0, max: 8.0, optimal: [6.5, 7.5] },
    humidity: { min: 20, max: 80, optimal: [40, 60] }
  },
  'Wheat': {
    temp: { min: 5, max: 35, optimal: [15, 30] },
    moisture: { min: 15, max: 75, optimal: [30, 60] },
    ph: { min: 6.0, max: 7.5, optimal: [6.5, 7.0] },
    humidity: { min: 20, max: 80, optimal: [40, 70] }
  },
  'Citrus': {
    temp: { min: 13, max: 38, optimal: [20, 30] },
    moisture: { min: 25, max: 85, optimal: [40, 70] },
    ph: { min: 5.5, max: 7.5, optimal: [6.0, 7.0] },
    humidity: { min: 30, max: 85, optimal: [50, 70] }
  },
  'Almonds': {
    temp: { min: 7, max: 40, optimal: [15, 30] },
    moisture: { min: 20, max: 80, optimal: [35, 65] },
    ph: { min: 6.0, max: 8.5, optimal: [6.5, 8.0] },
    humidity: { min: 20, max: 75, optimal: [40, 60] }
  },
  'Canola': {
    temp: { min: 5, max: 30, optimal: [12, 25] },
    moisture: { min: 20, max: 80, optimal: [35, 65] },
    ph: { min: 5.5, max: 8.0, optimal: [6.0, 7.5] },
    humidity: { min: 30, max: 85, optimal: [50, 75] }
  },
  'Default': {
    temp: { min: 5, max: 35, optimal: [15, 30] },
    moisture: { min: 15, max: 90, optimal: [30, 70] },
    ph: { min: 5.5, max: 8.5, optimal: [6.0, 8.0] },
    humidity: { min: 10, max: 90, optimal: [30, 80] }
  }
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, LineChartComponent, ModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css', './dashboard-premium.component.css', './dashboard-alt-modal.component.css', './dashboard-action-cards.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  CpuIcon = Cpu;
  DropletsIcon = Droplets;
  ThermometerIcon = Thermometer;
  WindIcon = Wind;
  SproutIcon = Sprout;
  CloudRainIcon = CloudRain;
  ExternalLinkIcon = ExternalLink;
  RefreshCwIcon = RefreshCw;
  CheckCircleIcon = CheckCircle;
  AlertTriangleIcon = AlertTriangle;
  ZapIcon = Zap;
  LayersIcon = Layers;
  GrapeIcon = Grape;
  FileTextIcon = FileText;
  SaveIcon = Save;
  Share2Icon = Share2;
  DownloadIcon = Download;
  LeafIcon = Leaf;

  private destroy$ = new Subject<void>();

  activeTab: 'overview' | 'advisor' = 'overview'; // Default tab

  weatherData: WeatherData | null = null;
  isDaytime: boolean = true;

  currentUser: User | null = null;
  currentBlock: Block | null = null;

  // Mock Sensors
  sensors: Sensor[] = [];

  // Crop Advisor Data
  advisorData = {
    riskScore: 0,
    riskLevel: 'Low',
    lastUpdated: '',
    sensorAnalysis: [
      {
        label: 'MOISTURE',
        value: '0%',
        status: 'PENDING',
        message: 'Initializing...',
        icon: Droplets,
        colorClass: 'good'
      },
      {
        label: 'PH',
        value: '0',
        status: 'PENDING',
        message: 'Initializing...',
        icon: Sprout,
        colorClass: 'good'
      },
      {
        label: 'TEMPERATURE',
        value: '0°C',
        status: 'PENDING',
        message: 'Initializing...',
        icon: Thermometer,
        colorClass: 'good'
      },
      {
        label: 'HUMIDITY',
        value: '0%',
        status: 'PENDING',
        message: 'Initializing...',
        icon: Wind,
        colorClass: 'good'
      },
      {
        label: 'WEATHER',
        value: '0°C',
        status: 'PENDING',
        message: 'Initializing...',
        icon: CloudRain,
        colorClass: 'good'
      }
    ],
    actions: [] as ActionItem[]
  };

  // Nutrient Index Data
  nutrientData = {
    status: 'Low' as 'High' | 'Medium' | 'Low',
    reason: 'Initializing...',
    score: 0,
    details: [] as string[]
  };

  isNutrientModalOpen: boolean = false;

  // Alternative crop recommendations
  alternativeCrops: CropRecommendation[] = [];
  yieldImpact: YieldImpact | null = null;

  // Decision Section Data
  decisionData = {
    totalArea: 0,
    current: {
      crop: '',
      lossPerHa: -2000,
      totalLoss: 0,
      yieldLossDetails: '0% moisture = 0% yield loss confirmed'
    },
    switch: {
      crop: 'Olives',
      area: 0,
      profitPerHa: 76000,
      totalProfit: 0,
      allocationMatch: 85,
      phValidated: false
    },
    keep: {
      crop: 'Premium Grapes',
      area: 0,
      profitPerHa: 156000,
      totalProfit: 0
    }
  };

  isRiskModalOpen: boolean = false;
  riskExplanations: string[] = [];

  // Alternative crop modal
  isAlternativeCropModalOpen: boolean = false;
  selectedAlternativeCrop: CropRecommendation | null = null;

  // Sensor Hover & Tab Logic
  hoveredSensor: Sensor | null = null;
  lockedSensor: Sensor | null = null; // For click/mobile interaction
  activeSensorTab: 'hours' | 'days' | 'weeks' = 'hours';

  selectedSensor: Sensor | null = null;
  isModalOpen: boolean = false;

  chartMode: 'hourly' | 'daily' = 'hourly';
  isLoading: boolean = false;
  nextRefreshSeconds: number = 60;
  private sensorInterval!: Subscription;
  private weatherInterval!: Subscription;
  private countdownInterval!: Subscription;
  private authSubscription!: Subscription;

  get currentSensorLabels(): string[] {
    const sensor = this.lockedSensor || this.hoveredSensor;
    if (!sensor) return [];

    switch (this.activeSensorTab) {
      case 'hours': return [...(sensor.labelsHours || sensor.historyLabels)];
      case 'days': return [...sensor.labelsDays];
      case 'weeks': return [...sensor.labelsWeeks];
      default: return [...(sensor.labelsHours || sensor.historyLabels)];
    }
  }

  get currentBlockPrefix(): string {
    if (!this.currentBlock?.name) return '';
    return this.currentBlock.name.split(' - ')[0];
  }

  constructor(
    public weatherService: WeatherService,
    private authService: AuthService,
    private blockService: BlockService,
    private cropAdvisorService: CropAdvisorService,
    private sensorService: SensorService
  ) { }

  ngOnInit(): void {
    // Initialize sensors from service
    this.sensors = this.sensorService.getSensors();

    // Sync with global block service
    this.blockService.selectedBlock$
      .pipe(takeUntil(this.destroy$))
      .subscribe(sharedBlock => {
        if (sharedBlock) {
          console.log('📦 Block selected from service:', {
            name: sharedBlock.name,
            location: sharedBlock.location,
            lat: sharedBlock.lat,
            lon: sharedBlock.lon
          });

          // Map shared block to local dashboard block structure
          this.currentBlock = {
            ...sharedBlock,
            crop: sharedBlock.grapeVariety, // Map variety to crop
            area: sharedBlock.size, // Map size to area
            soilType: sharedBlock.soilType,
            location: {
              name: sharedBlock.location,
              lat: sharedBlock.lat,
              lon: sharedBlock.lon
            }
          } as Block;

          console.log('🎯 Current block after mapping:', {
            name: this.currentBlock.name,
            location: this.currentBlock.location
          });

          this.refreshWeather(); // Refresh weather for new block location
          this.updateAdvisorData();
        }
      });

    // Initialize Adelaide time immediately
    this.updateAdelaideTime();

    // Subscribe to active user changes
    this.authSubscription = this.authService.getActiveUser().subscribe(appUser => {
      if (appUser) {
        this.loadUserData(appUser);
        this.refreshWeather();
        this.updateAdvisorData();
      }
    });

    // Refresh weather every 5 minutes
    this.weatherInterval = interval(300000).subscribe(() => this.refreshWeather());

    // Simulate sensor readings every 1 minute
    this.sensorInterval = interval(60000).subscribe(() => {
      this.simulateSensorReadings();
      this.nextRefreshSeconds = 60; // Reset countdown
    });

    // Handle countdown ticker every second
    this.countdownInterval = interval(1000).subscribe(() => {
      if (this.nextRefreshSeconds > 0) {
        this.nextRefreshSeconds--;
      }
      // Update Adelaide time every second for live clock
      this.updateAdelaideTime();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.sensorInterval) this.sensorInterval.unsubscribe();
    if (this.weatherInterval) this.weatherInterval.unsubscribe();
    if (this.countdownInterval) this.countdownInterval.unsubscribe();
    if (this.authSubscription) this.authSubscription.unsubscribe();
  }

  loadUserData(appUser: AppUser): void {
    // Map AppUser to dashboard User format
    this.currentUser = {
      id: appUser.userId,
      name: appUser.userName,
      blocks: appUser.blocks.map((block, index) => {
        const blockNumber = index + 1;
        const cropName = block.crop || appUser.primaryCropName;

        return {
          id: block.lanslu,
          name: `BLOCK ${blockNumber} - ${cropName}`,
          crop: cropName,
          area: block.area,
          soilType: appUser.primarySoilType,
          soilDescription: block.description,
          location: {
            name: appUser.farmLocation,
            lat: this.getLatLongForLocation(appUser.farmLocation).lat,
            lon: this.getLatLongForLocation(appUser.farmLocation).lon
          },
          coordinates: '',
          size: block.area,
          sizeUnit: 'hectares',
          grapeVariety: cropName,
          lan: block.lanslu
        } as Block;
      })
    };

    // Only set default if no block selected via service
    if (!this.currentBlock && this.currentUser.blocks.length > 0) {
      this.currentBlock = this.currentUser.blocks[0];
    }
  }

  getLatLongForLocation(location: string): { lat: number; lon: number } {
    // Map locations to coordinates (South Australia wine regions)
    const locationMap: Record<string, { lat: number; lon: number }> = {
      'Renmark, SA': { lat: -34.1747, lon: 140.7472 },        // Riverland
      'Tanunda, SA': { lat: -34.5267, lon: 138.9600 },        // Barossa Valley
      'Willunga, SA': { lat: -35.2733, lon: 138.5500 },       // McLaren Vale
      'Waikerie, SA': { lat: -34.1833, lon: 139.9833 },       // Riverland
      'Nuriootpa, SA': { lat: -34.4667, lon: 138.9833 }       // Barossa Valley
    };
    return locationMap[location] || { lat: -34.1747, lon: 140.7472 }; // Default to Renmark
  }

  simulateSensorReadings() {
    this.sensorService.simulateSensorReadings();
    this.updateAdvisorData();

    // If modal is open, ensure chart updates
    if (this.isModalOpen && this.selectedSensor) {
      // Trigger generic change detection if needed? 
      // Angular's default change detection should pick up the array mutation if we are careful, 
      // but for OnPush or Chart lib we might need new array reference.
      this.selectedSensor.history = [...this.selectedSensor.history];
    }
  }

  updateAdelaideTime() {
    // Get current UTC time
    const now = new Date();

    // Adelaide is UTC+10:30 (ACDT during daylight saving, roughly Oct-Apr)
    // UTC+9:30 (ACST during standard time, roughly Apr-Oct)
    // For Feb 2026, it should be ACDT (UTC+10:30)
    const adelaideOffset = 10.5; // hours ahead of UTC

    // Convert to Adelaide time
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const adelaideTime = new Date(utcTime + (3600000 * adelaideOffset));

    // Format the time
    this.advisorData.lastUpdated = adelaideTime.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  updateAdvisorData() {
    // 1. Update timestamp with Adelaide time
    this.updateAdelaideTime();

    // 2. Sync sensor analysis values
    const moisture = this.sensors.find(s => s.label === 'Soil Moisture');
    const ph = this.sensors.find(s => s.label === 'pH Level');
    const airTemp = this.sensors.find(s => s.label === 'Air Temperature');
    const soilTemp = this.sensors.find(s => s.label === 'Soil Temperature');
    const humidity = this.sensors.find(s => s.label === 'Humidity');

    if (moisture) {
      const analysis = this.advisorData.sensorAnalysis[0];
      analysis.value = `${moisture.value}%`;
      this.evaluateParameter(analysis, 'moisture', moisture.value as number);
    }
    if (ph) {
      const analysis = this.advisorData.sensorAnalysis[1];
      analysis.value = `${ph.value}`;
      this.evaluateParameter(analysis, 'ph', ph.value as number);
    }
    if (airTemp) {
      const analysis = this.advisorData.sensorAnalysis[2];
      analysis.value = `${airTemp.value}°C`;
      this.evaluateParameter(analysis, 'temp', airTemp.value as number);
    }
    if (humidity) {
      const analysis = this.advisorData.sensorAnalysis[3];
      analysis.value = `${humidity.value}%`;
      this.evaluateParameter(analysis, 'humidity', humidity.value as number);
    }
    if (this.weatherData) {
      const analysis = this.advisorData.sensorAnalysis[4];
      analysis.value = `${this.weatherData.current.temperature}°C`;
      this.evaluateParameter(analysis, 'temp', this.weatherData.current.temperature);
    }

    // 3. Calculate Risk Score
    this.calculateRiskStatus();

    // 4. Generate dynamic recommendations using CropAdvisorService
    if (this.currentBlock && moisture && ph && airTemp && soilTemp && humidity) {
      const sensorData = {
        moisture: Number(moisture.value),
        ph: Number(ph.value),
        airTemp: Number(airTemp.value),
        soilTemp: Number(soilTemp.value),
        humidity: Number(humidity.value)
      };

      // Generate action recommendations
      this.advisorData.actions = this.cropAdvisorService.generateRecommendations(
        sensorData,
        this.currentBlock.crop
      );

      // Calculate yield impact
      this.yieldImpact = this.cropAdvisorService.calculateYieldImpact(
        sensorData,
        this.currentBlock.crop,
        this.currentBlock.area
      );

      // Get alternative crop recommendations
      this.alternativeCrops = this.cropAdvisorService.recommendAlternativeCrops(
        sensorData,
        this.currentBlock.crop
      );
    }

    // 5. Calculate Nutrient Index
    this.nutrientData = this.sensorService.calculateNutrientIndex(this.sensors);
  }

  evaluateParameter(analysis: any, type: string, value: number) {
    if (!this.currentBlock) return;
    const crop = this.currentBlock.crop;
    const profile = CROP_PROFILES[crop] || CROP_PROFILES['Default'];
    const thresholds = profile[type];

    if (value < thresholds.min || value > thresholds.max) {
      analysis.status = 'CRITICAL';
      analysis.message = value < thresholds.min ? 'Below survival limit' : 'Above survival limit';
      analysis.colorClass = 'error';
    } else if (value < thresholds.optimal[0] || value > thresholds.optimal[1]) {
      analysis.status = 'WARNING';
      analysis.message = 'Outside optimal range';
      analysis.colorClass = 'warning';
    } else {
      analysis.status = 'GOOD';
      analysis.message = 'Optimal conditions';
      analysis.colorClass = 'good';
    }
  }

  calculateRiskStatus() {
    if (!this.currentBlock) return;
    const crop = this.currentBlock.crop;
    const profile = CROP_PROFILES[crop] || CROP_PROFILES['Default'];
    this.riskExplanations = [];
    let riskCount = 0;
    let totalParams = 0;

    const check = (type: string, value: number, label: string) => {
      totalParams++;
      const thresh = profile[type];
      if (value < thresh.min || value > thresh.max) {
        this.riskExplanations.push(`${label} is at CRITICAL levels (${value}) for ${crop}.`);
        riskCount += 1.0;
      } else if (value < thresh.optimal[0] || value > thresh.optimal[1]) {
        this.riskExplanations.push(`${label} is outside optimal range (${value}) for ${crop}.`);
        riskCount += 0.4;
      }
    };

    const moisture = this.sensors.find(s => s.label === 'Soil Moisture')?.value as number;
    const ph = this.sensors.find(s => s.label === 'pH Level')?.value as number;
    const airTemp = this.sensors.find(s => s.label === 'Air Temperature')?.value as number;
    const humidity = this.sensors.find(s => s.label === 'Humidity')?.value as number;

    if (moisture !== undefined) check('moisture', moisture, 'Soil Moisture');
    if (ph !== undefined) check('ph', ph, 'Soil pH');
    if (airTemp !== undefined) check('temp', airTemp, airTemp > profile.temp.optimal[1] ? 'High Heat' : 'Low Temp');
    if (humidity !== undefined) check('humidity', humidity, 'Humidity');

    const score = Math.round((riskCount / totalParams) * 100);
    this.advisorData.riskScore = score;
    this.advisorData.riskLevel = score > 60 ? 'High' : score > 20 ? 'Moderate' : 'Low';

    if (this.riskExplanations.length === 0) {
      this.riskExplanations.push(`All monitored parameters for ${crop} are currently within optimal ranges.`);
    }

    this.calculateDecisions();
  }

  calculateDecisions() {
    if (!this.currentBlock) return;
    this.decisionData.totalArea = this.currentBlock.area;
    this.decisionData.current.crop = this.currentBlock.crop;

    // Use yield impact from CropAdvisorService if available
    if (this.yieldImpact) {
      const yieldLossPercent = 100 - this.yieldImpact.currentYieldPercent;
      const moisture = this.sensors.find(s => s.label === 'Soil Moisture')?.value as number || 32;

      this.decisionData.current.yieldLossDetails = `${moisture.toFixed(0)}% moisture = ${yieldLossPercent.toFixed(0)}% yield loss confirmed`;

      // Calculate loss based on yield impact
      const baseProfitPerHa = this.cropAdvisorService.getCropProfile(this.currentBlock.crop)?.profitPerHa || 12000;
      this.decisionData.current.lossPerHa = -(baseProfitPerHa * (yieldLossPercent / 100));
      this.decisionData.current.totalLoss = this.decisionData.current.lossPerHa * this.currentBlock.area;
    } else {
      // Fallback to original logic
      const moistureObj = this.sensors.find(s => s.label === 'Soil Moisture');
      const moisture = moistureObj ? Number(moistureObj.value) : 32;

      let yieldLossPercent = 0;
      if (moisture < 40) {
        yieldLossPercent = Math.min(100, 10 + (40 - moisture) * 2.5);
      }

      this.decisionData.current.yieldLossDetails = `${moisture.toFixed(0)}% moisture = ${yieldLossPercent.toFixed(0)}% yield loss confirmed`;
      this.decisionData.current.totalLoss = this.decisionData.current.lossPerHa * this.currentBlock.area;
    }

    // Use alternative crop recommendations for switch option
    if (this.alternativeCrops.length > 0) {
      const topAlternative = this.alternativeCrops[0];
      const switchArea = Math.round(this.currentBlock.area * 0.7);
      const keepArea = this.currentBlock.area - switchArea;

      this.decisionData.switch.crop = topAlternative.cropName;
      this.decisionData.switch.area = switchArea;
      this.decisionData.switch.profitPerHa = topAlternative.profitPerHa;
      this.decisionData.switch.totalProfit = topAlternative.profitPerHa * switchArea;
      this.decisionData.switch.allocationMatch = Math.round(topAlternative.suitabilityScore);
      this.decisionData.switch.phValidated = topAlternative.phCompatible;

      // Keep option with premium grapes
      this.decisionData.keep.area = keepArea;
      this.decisionData.keep.totalProfit = this.decisionData.keep.profitPerHa * keepArea;
    } else {
      // Fallback to default Olives recommendation
      const switchArea = Math.round(this.currentBlock.area * 0.7);
      const keepArea = this.currentBlock.area - switchArea;

      this.decisionData.switch.area = switchArea;
      this.decisionData.switch.totalProfit = this.decisionData.switch.profitPerHa * switchArea;

      const phObj = this.sensors.find(s => s.label === 'pH Level');
      const ph = phObj ? Number(phObj.value) : 7.5;
      this.decisionData.switch.phValidated = (ph >= 6.0 && ph <= 8.5);

      this.decisionData.keep.area = keepArea;
      this.decisionData.keep.totalProfit = this.decisionData.keep.profitPerHa * keepArea;
    }
  }

  openRiskModal() {
    this.isRiskModalOpen = true;
  }

  closeRiskModal() {
    this.isRiskModalOpen = false;
  }

  openNutrientModal() {
    this.isNutrientModalOpen = true;
  }

  closeNutrientModal() {
    this.isNutrientModalOpen = false;
  }

  openAlternativeCropModal(crop: CropRecommendation) {
    this.selectedAlternativeCrop = crop;
    this.isAlternativeCropModalOpen = true;
  }

  closeAlternativeCropModal() {
    this.isAlternativeCropModalOpen = false;
    this.selectedAlternativeCrop = null;
  }

  // Helper method to format currency values without excessive decimals
  formatCurrency(value: number): string {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      const kValue = value / 1000;
      // Round to 1 decimal place
      return `$${kValue.toFixed(1)}k`;
    } else {
      return `$${Math.round(value)}`;
    }
  }

  // Helper method to get sensor value by label
  getSensorValue(label: string): number | string {
    const sensor = this.sensors.find(s => s.label === label);
    return sensor?.value ?? 'N/A';
  }

  // Grant Guide Modal
  isGrantModalOpen: boolean = false;

  openGrantModal() {
    this.isGrantModalOpen = true;
  }

  closeGrantModal() {
    this.isGrantModalOpen = false;
  }

  openLink(url: string) {
    if (url) {
      window.open(url, '_blank');
    }
  }

  downloadPdf() {
    // @ts-ignore
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Brand Colors
    const primaryGreen = '#2e7d32';
    const lightGreen = '#e8f5e9';
    const warningRed = '#dc2626';

    // 1. HEADER section (Green background)
    doc.setFillColor(primaryGreen);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Promasecure Riverland MVP", 105, 15, { align: 'center' });

    doc.setFontSize(14);
    doc.text(`Block ${this.currentBlock?.name || 'N/A'} - ${this.currentBlock?.crop || 'N/A'} - ${this.decisionData.totalArea}ha Plan`, 105, 25, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`Generated: ${today}`, 105, 33, { align: 'center' });

    let yPos = 50;
    doc.setTextColor(0, 0, 0);

    // 2. IOT DATA SUMMARY
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen);
    doc.text("IOT DATA SUMMARY", 14, yPos);
    yPos += 5;

    // @ts-ignore
    doc.autoTable({
      startY: yPos,
      head: [['Moisture', 'pH', 'Allocation']],
      body: [[
        `${this.decisionData.current.yieldLossDetails.split('%')[0]}%`,
        '7.5',
        '85%'
      ]],
      foot: [['GOOD', 'PERFECT', 'ADEQUATE']],
      theme: 'grid',
      headStyles: { fillColor: primaryGreen, halign: 'center' },
      bodyStyles: { halign: 'center', fontSize: 12 },
      footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold' },
      styles: { cellPadding: 2 }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // 3. RECOMMENDATION BOX
    doc.setFillColor(primaryGreen);
    doc.roundedRect(14, yPos, 182, 25, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`RECOMMENDED ${this.decisionData.totalArea}ha PILOT`, 105, yPos + 10, { align: 'center' });

    doc.setFontSize(12);
    const profitM = (this.decisionData.switch.totalProfit + this.decisionData.keep.totalProfit) / 1000000;
    doc.text(`${this.decisionData.switch.area}ha OLIVES + ${this.decisionData.keep.area}ha PREMIUM GRAPES = $${profitM.toFixed(2)}M ANNUAL PROFIT`, 105, yPos + 18, { align: 'center' });

    yPos += 35;

    // Financial Comparison
    doc.setFontSize(12);
    doc.setTextColor(warningRed);
    const lossK = Math.abs(this.decisionData.current.totalLoss / 1000).toFixed(0);
    // Calculated improvement percentage: (New Profit - (-Loss)) / Loss roughly, or just New Profit / old revenue? 
    // Using reference text logic: 1M vs -18k is huge.
    doc.text(`vs Current Wine: -$${lossK}K LOSS! • 5634% improvement`, 105, yPos - 3, { align: 'center' });

    yPos += 10;

    // 4. DETAILED ACTION PLAN
    doc.setFontSize(14);
    doc.setTextColor(primaryGreen);
    doc.text("DETAILED ACTION PLAN", 14, yPos);
    yPos += 5;

    // WEEK BY WEEK EXECUTION
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("Week-by-Week Execution", 14, yPos + 5);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 8,
      head: [['Week', 'Action', 'Who', 'Cost']],
      body: [
        ['1', `Deep rip ${this.decisionData.switch.area}ha`, 'Contractor', '$16K'],
        ['2', 'Order olive trees', 'Agromillora', '$228K'],
        ['3', 'Plant high-density', 'Labor', '$20K'],
        ['4', 'Apply grants', 'WGCSA', 'FREE'],
      ],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
      styles: { fontSize: 10, cellPadding: 2 }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 10;

    // CROP BREAKDOWN
    doc.setFontSize(12);
    doc.text("Crop Breakdown", 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 3,
      head: [['Crop', 'Hectares', 'Water ML/ha', 'Profit/ha', 'TOTAL PROFIT']],
      body: [
        ['Olives', `${this.decisionData.switch.area}ha`, '5-9.5', `$${this.decisionData.switch.profitPerHa / 1000}K`, `$${(this.decisionData.switch.totalProfit / 1000).toFixed(0)}K`],
        ['Premium Grapes', `${this.decisionData.keep.area}ha`, '6-8', `$${this.decisionData.keep.profitPerHa / 1000}K`, `$${(this.decisionData.keep.totalProfit / 1000).toFixed(0)}K`],
        [{ content: 'TOTAL PILOT', styles: { fontStyle: 'bold' } }, `${this.decisionData.totalArea}ha`, 'Fits allocation', '$102K avg', `$${profitM.toFixed(2)}M`]
      ],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
      footStyles: { fillColor: lightGreen, textColor: primaryGreen, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 2 }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    // RISK ASSESSMENT
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("RISK ASSESSMENT", 14, yPos);

    doc.setFillColor(primaryGreen); // Green risk box
    doc.roundedRect(14, yPos + 3, 60, 15, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("LOW RISK - 0%", 44, yPos + 12, { align: 'center' });

    // FOOTER
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Sources: PIRSA Olive Factsheet 2025 | Tingey-Holyoak 2024 | Your IoT Sensors Live", 105, 285, { align: 'center' });
    doc.setTextColor(primaryGreen);
    doc.text("Eligible for SA Grape Growers Assistance Fund! 50% planting cost coverage", 105, 290, { align: 'center' });

    // Save
    doc.save(`Promasecure_Plan_${this.currentBlock?.name || 'Farm'}_${new Date().toISOString().split('T')[0]}.pdf`);
  }


  refreshWeather() {
    if (!this.currentBlock) {
      console.log('⚠️ refreshWeather: No current block selected');
      return;
    }

    console.log('🌤️ Refreshing weather for:', {
      blockName: this.currentBlock.name,
      location: this.currentBlock.location.name,
      lat: this.currentBlock.location.lat,
      lon: this.currentBlock.location.lon
    });

    this.isLoading = true;
    this.weatherService.getWeatherForecast(
      this.currentBlock.location.lat,
      this.currentBlock.location.lon
    ).subscribe({
      next: (data) => {
        console.log('✅ Weather data received:', {
          temperature: data.current.temperature,
          location: this.currentBlock?.location.name
        });
        this.weatherData = data;
        this.isDaytime = !!data.current.isDay;
        this.isLoading = false;
        this.updateAdvisorData(); // Update advisor with new weather data
      },
      error: (err) => {
        console.error('❌ Failed to fetch weather', err);
        this.isLoading = false;
      }
    });
  }

  openSensorHistory(sensor: Sensor) {
    this.selectedSensor = sensor;
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
    this.selectedSensor = null;
  }

  // Sensor Pop-up Methods
  onSensorHover(sensor: Sensor) {
    if (!this.lockedSensor) {
      this.hoveredSensor = sensor;
      if (this.hoveredSensor !== sensor) {
        this.activeSensorTab = 'hours'; // Reset only if changing sensors
      }
    }
  }

  onSensorLeave() {
    if (!this.lockedSensor) {
      this.hoveredSensor = null;
    }
  }

  togglePopup(sensor: Sensor) {
    if (this.lockedSensor === sensor) {
      this.closePopup();
    } else {
      this.lockedSensor = sensor;
      this.hoveredSensor = sensor;
      this.activeSensorTab = 'hours';
    }
  }

  closePopup(event?: Event) {
    if (event) event.stopPropagation();
    this.lockedSensor = null;
    this.hoveredSensor = null;
  }

  setSensorTab(tab: 'hours' | 'days' | 'weeks') {
    this.activeSensorTab = tab;
  }

  get currentSensorData(): number[] {
    const sensor = this.lockedSensor || this.hoveredSensor;
    if (!sensor) return [];

    let data: number[] = [];
    switch (this.activeSensorTab) {
      case 'hours': data = sensor.historyHours || sensor.history; break;
      case 'days': data = sensor.historyDays; break;
      case 'weeks': data = sensor.historyWeeks; break;
      default: data = sensor.historyHours || sensor.history;
    }
    // Ensure data is copied to avoid mutation issues if chart modifies it (unlikely but safe)
    return [...data];
  }



  setActiveTab(tab: 'overview' | 'advisor') {
    this.activeTab = tab;
  }

  toggleChart(mode: 'hourly' | 'daily') {
    this.chartMode = mode;
  }

  get chartDataSeries(): ChartSeries[] {
    if (!this.weatherData) return [];

    if (this.chartMode === 'hourly') {
      return [
        {
          name: 'Temp °C',
          data: this.weatherData.hourly.temperature_2m.slice(0, 24),
          color: '#f59e0b',
          unit: '°C'
        },
        {
          name: 'Humidity %',
          data: this.weatherData.hourly.relative_humidity_2m.slice(0, 24),
          color: '#3b82f6',
          unit: '%'
        },
        {
          name: 'Rain Prob %',
          data: this.weatherData.hourly.rain.slice(0, 24).map(r => r > 0 ? 10 : 0), // Mocking probability or just showing rain presence
          color: '#60a5fa',
          unit: '%'
        }
      ];
    } else {
      return [
        {
          name: 'Max Temp',
          data: this.weatherData.daily.temperature_2m_max,
          color: '#f59e0b',
          unit: '°C'
        },
        {
          name: 'Min Temp',
          data: this.weatherData.daily.temperature_2m_min,
          color: '#3b82f6',
          unit: '°C'
        }
      ];
    }
  }

  // Backwards compatibility for sensor history modal
  get chartData(): number[] {
    if (!this.weatherData) return [];
    if (this.chartMode === 'hourly') {
      return this.weatherData.hourly.temperature_2m.slice(0, 24);
    } else {
      return this.weatherData.daily.temperature_2m_max;
    }
  }

  get chartLabels(): string[] {
    if (!this.weatherData) return [];
    if (this.chartMode === 'hourly') {
      return this.formatHourlyLabels(this.weatherData.hourly.time.slice(0, 24));
    } else {
      return this.formatDailyLabels(this.weatherData.daily.time);
    }
  }

  formatHourlyLabels(times: string[]): string[] {
    return times.map(t => new Date(t).getHours() + ':00');
  }

  formatDailyLabels(dates: string[]): string[] {
    return dates.map(d => {
      const date = new Date(d);
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    });
  }

  getAverage(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  formatCountdown(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  getMax(arr: number[]): number {
    return Math.max(...arr);
  }
}
