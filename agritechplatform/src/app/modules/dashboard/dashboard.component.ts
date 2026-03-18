import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { distinctUntilChanged, filter, interval, Subject, Subscription, takeUntil } from 'rxjs';
import {
  AlertTriangle,
  CheckCircle,
  CloudRain,
  Cpu,
  Download,
  Droplets,
  ExternalLink,
  FileText,
  Grape,
  Layers,
  Leaf,
  LucideAngularModule,
  RefreshCw,
  Save,
  Share2,
  Sprout,
  Thermometer,
  Wind,
  Zap
} from 'lucide-angular';
import { WeatherData, WeatherService } from '../../core/services/weather.service';
import { BlockService } from '../../shared/services/block.service';
import { Block as SharedBlock } from '../../shared/models';
import { LineChartComponent, ChartSeries } from '../../shared/components/line-chart.component';
import { ModalComponent } from '../../shared/components/modal.component';
import {
  BlockInsightsResponse,
  DashboardActionItem,
  DashboardAlternativeCrop,
  DashboardApiService,
  DashboardDecisionData,
  DashboardMetric,
  DashboardMetricKey,
  DashboardYieldImpact
} from '../../core/services/dashboard-api.service';

interface DashboardBlock extends Omit<SharedBlock, 'location'> {
  crop: string;
  area: number;
  soilDescription?: string;
  location: {
    name: string;
    lat: number;
    lon: number;
  };
}

interface DashboardSensor {
  id: DashboardMetricKey;
  label: string;
  value: number;
  unit: string;
  status: 'Normal' | 'Low' | 'High';
  icon: any;
  summaryLabel: string;
  message: string;
  colorClass: 'good' | 'warning' | 'error';
  history: number[];
  historyLabels: string[];
  historyHours: number[];
  labelsHours: string[];
  historyDays: number[];
  labelsDays: string[];
  historyWeeks: number[];
  labelsWeeks: string[];
  suggestedMin?: number;
  suggestedMax?: number;
}

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

  private readonly destroy$ = new Subject<void>();
  private weatherInterval?: Subscription;
  private weatherRequest?: Subscription;
  private insightsRequest?: Subscription;

  activeTab: 'overview' | 'advisor' = 'overview';
  chartMode: 'hourly' | 'daily' = 'hourly';
  activeSensorTab: 'hours' | 'days' | 'weeks' = 'hours';

  weatherData: WeatherData | null = null;
  isDaytime = true;
  isLoading = false;
  isInsightsLoading = false;
  isUsingFallbackData = false;
  dashboardWarningMessage: string | null = null;

  currentBlock: DashboardBlock | null = null;
  latestInsights: BlockInsightsResponse | null = null;

  sensors: DashboardSensor[] = [];
  advisorData = {
    riskScore: 0,
    riskLevel: 'Low' as 'Low' | 'Moderate' | 'High',
    lastUpdated: 'Waiting for backend insight refresh',
    sensorAnalysis: [
      { label: 'CROP HEALTH', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Sprout, colorClass: 'good' },
      { label: 'WATER STATUS', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Droplets, colorClass: 'good' },
      { label: 'NUTRIENT STATUS', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Layers, colorClass: 'good' },
      { label: 'CANOPY DENSITY', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Leaf, colorClass: 'good' },
      { label: 'YIELD ESTIMATE', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Grape, colorClass: 'good' }
    ],
    actions: [] as DashboardActionItem[]
  };
  riskExplanations: string[] = [];

  nutrientData = {
    status: 'Low' as 'High' | 'Medium' | 'Low',
    reason: 'Waiting for backend insights',
    score: 0,
    details: [] as string[]
  };

  alternativeCrops: DashboardAlternativeCrop[] = [];
  yieldImpact: DashboardYieldImpact | null = null;
  decisionData: DashboardDecisionData = {
    totalArea: 0,
    current: { crop: '', lossPerHa: 0, totalLoss: 0, yieldLossDetails: 'Waiting for backend insights' },
    switch: { crop: 'Olives', area: 0, profitPerHa: 0, totalProfit: 0, allocationMatch: 0, validated: false, validationText: 'Waiting for backend insights' },
    keep: { crop: '', area: 0, profitPerHa: 0, totalProfit: 0 }
  };

  isRiskModalOpen = false;
  isNutrientModalOpen = false;
  isGrantModalOpen = false;
  isAlternativeCropModalOpen = false;
  selectedAlternativeCrop: DashboardAlternativeCrop | null = null;

  hoveredSensor: DashboardSensor | null = null;
  lockedSensor: DashboardSensor | null = null;
  selectedSensor: DashboardSensor | null = null;
  isModalOpen = false;

  constructor(
    public weatherService: WeatherService,
    private blockService: BlockService,
    private dashboardApiService: DashboardApiService
  ) { }

  get currentSensorLabels(): string[] {
    const sensor = this.lockedSensor || this.hoveredSensor;
    if (!sensor) return [];

    switch (this.activeSensorTab) {
      case 'hours':
        return [...sensor.labelsHours];
      case 'days':
        return [...sensor.labelsDays];
      case 'weeks':
        return [...sensor.labelsWeeks];
      default:
        return [...sensor.labelsHours];
    }
  }

  get currentSensorData(): number[] {
    const sensor = this.lockedSensor || this.hoveredSensor;
    if (!sensor) return [];

    switch (this.activeSensorTab) {
      case 'hours':
        return [...sensor.historyHours];
      case 'days':
        return [...sensor.historyDays];
      case 'weeks':
        return [...sensor.historyWeeks];
      default:
        return [...sensor.historyHours];
    }
  }

  get currentBlockPrefix(): string {
    if (!this.currentBlock?.name) return '';
    return this.currentBlock.name.split(' - ')[0];
  }

  get chartDataSeries(): ChartSeries[] {
    if (!this.weatherData) return [];

    if (this.chartMode === 'hourly') {
      return [
        {
          name: 'Temp C',
          data: this.weatherData.hourly.temperature_2m.slice(0, 24),
          color: '#f59e0b',
          unit: 'C'
        },
        {
          name: 'Humidity %',
          data: this.weatherData.hourly.relative_humidity_2m.slice(0, 24),
          color: '#3b82f6',
          unit: '%'
        },
        {
          name: 'Rain mm',
          data: this.weatherData.hourly.rain.slice(0, 24),
          color: '#60a5fa',
          unit: 'mm'
        }
      ];
    }

    return [
      {
        name: 'Max Temp',
        data: this.weatherData.daily.temperature_2m_max,
        color: '#f59e0b',
        unit: 'C'
      },
      {
        name: 'Min Temp',
        data: this.weatherData.daily.temperature_2m_min,
        color: '#3b82f6',
        unit: 'C'
      }
    ];
  }

  get chartLabels(): string[] {
    if (!this.weatherData) return [];
    return this.chartMode === 'hourly'
      ? this.formatHourlyLabels(this.weatherData.hourly.time.slice(0, 24))
      : this.formatDailyLabels(this.weatherData.daily.time);
  }

  ngOnInit(): void {
    this.blockService.block$
      .pipe(
        takeUntil(this.destroy$),
        filter((block): block is SharedBlock => !!block),
        distinctUntilChanged((previous, current) => previous.lan === current.lan)
      )
      .subscribe(block => {
        this.currentBlock = this.mapSharedBlock(block);
        this.refreshWeather();
        this.loadBlockInsights(this.currentBlock);
      });

    this.weatherInterval = interval(300000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshWeather());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.weatherInterval?.unsubscribe();
    this.weatherRequest?.unsubscribe();
    this.insightsRequest?.unsubscribe();
  }

  private mapSharedBlock(block: SharedBlock): DashboardBlock {
    return {
      ...block,
      crop: block.crop || block.grapeVariety,
      area: block.size,
      soilDescription: block.soilDescription,
      location: {
        name: block.location,
        lat: block.lat,
        lon: block.lon
      }
    };
  }

  private loadBlockInsights(block: DashboardBlock): void {
    this.isInsightsLoading = true;
    this.insightsRequest?.unsubscribe();

    this.insightsRequest = this.dashboardApiService.getBlockInsights(block.lan || block.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: insights => {
          this.applyInsights(block, insights);
          this.isInsightsLoading = false;
        },
        error: error => {
          console.error('Dashboard insights request failed unexpectedly.', error);
          this.dashboardWarningMessage = 'Unable to load backend dashboard insights.';
          this.isInsightsLoading = false;
        }
      });
  }

  private applyInsights(block: DashboardBlock, insights: BlockInsightsResponse): void {
    const previousHoveredId = this.hoveredSensor?.id;
    const previousLockedId = this.lockedSensor?.id;
    const previousSelectedId = this.selectedSensor?.id;

    this.latestInsights = insights;
    this.isUsingFallbackData = insights.source === 'fallback';
    this.dashboardWarningMessage = insights.warning;

    this.sensors = this.mapMetricsToSensors(insights.metrics);
    this.hoveredSensor = this.findSensorById(previousHoveredId);
    this.lockedSensor = this.findSensorById(previousLockedId);
    this.selectedSensor = this.findSensorById(previousSelectedId);

    this.advisorData = {
      riskScore: insights.advisor.riskScore,
      riskLevel: insights.advisor.riskLevel,
      lastUpdated: this.formatInsightsTimestamp(insights.composite_date_to),
      sensorAnalysis: insights.advisor.sensorAnalysis.map(item => ({
        ...item,
        icon: this.getAnalysisIcon(item.label)
      })),
      actions: insights.advisor.actions
    };

    this.riskExplanations = [...insights.advisor.riskExplanations];
    this.nutrientData = { ...insights.nutrient, details: [...insights.nutrient.details] };
    this.yieldImpact = {
      ...insights.yieldImpact,
      factors: insights.yieldImpact.factors.map(factor => ({ ...factor }))
    };
    this.alternativeCrops = insights.alternativeCrops.map(crop => ({ ...crop, reasons: [...crop.reasons] }));
    this.decisionData = this.mapDecisionData(insights.decision, block);
  }

  private mapDecisionData(decision: DashboardDecisionData, block: DashboardBlock): DashboardDecisionData {
    const resolveCropName = (value: string | undefined, fallback: string) =>
      !value || value === 'Current Block' ? fallback : value;

    return {
      totalArea: decision.totalArea || block.area,
      current: {
        crop: resolveCropName(decision.current.crop, block.crop),
        lossPerHa: decision.current.lossPerHa,
        totalLoss: decision.current.totalLoss,
        yieldLossDetails: decision.current.yieldLossDetails
      },
      switch: {
        crop: decision.switch.crop,
        area: decision.switch.area,
        profitPerHa: decision.switch.profitPerHa,
        totalProfit: decision.switch.totalProfit,
        allocationMatch: decision.switch.allocationMatch,
        validated: decision.switch.validated,
        validationText: decision.switch.validationText
      },
      keep: {
        crop: resolveCropName(decision.keep.crop, block.crop),
        area: decision.keep.area,
        profitPerHa: decision.keep.profitPerHa,
        totalProfit: decision.keep.totalProfit
      }
    };
  }

  private mapMetricsToSensors(metrics: Record<DashboardMetricKey, DashboardMetric>): DashboardSensor[] {
    const iconMap: Record<DashboardMetricKey, any> = {
      ndvi: Sprout,
      ndwi: Droplets,
      ndre: Layers,
      evi: Leaf,
      lai: Grape
    };

    return (['ndvi', 'ndwi', 'ndre', 'evi', 'lai'] as DashboardMetricKey[]).map(key => {
      const metric = metrics[key];
      return {
        id: key,
        label: metric.title,
        value: metric.value,
        unit: metric.unit,
        status: metric.status,
        icon: iconMap[key],
        summaryLabel: metric.label,
        message: metric.message,
        colorClass: metric.colorClass,
        history: [...metric.history.hours.slice(-5)],
        historyLabels: [...metric.history.labelsHours.slice(-5)],
        historyHours: [...metric.history.hours],
        labelsHours: [...metric.history.labelsHours],
        historyDays: [...metric.history.days],
        labelsDays: [...metric.history.labelsDays],
        historyWeeks: [...metric.history.weeks],
        labelsWeeks: [...metric.history.labelsWeeks],
        suggestedMin: key === 'lai' ? 0 : 0,
        suggestedMax: key === 'lai' ? 6.5 : 100
      };
    });
  }

  private findSensorById(id?: DashboardMetricKey): DashboardSensor | null {
    if (!id) return null;
    return this.sensors.find(sensor => sensor.id === id) || null;
  }

  private getAnalysisIcon(label: string): any {
    if (label.includes('WATER')) return Droplets;
    if (label.includes('NUTRIENT')) return Layers;
    if (label.includes('CANOPY')) return Leaf;
    if (label.includes('YIELD')) return Grape;
    return Sprout;
  }

  private formatInsightsTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return timestamp;
    }

    return date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  refreshWeather(): void {
    if (!this.currentBlock) return;

    this.isLoading = true;
    this.weatherRequest?.unsubscribe();
    this.weatherRequest = this.weatherService.getWeatherForecast(
      this.currentBlock.location.lat,
      this.currentBlock.location.lon
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.weatherData = data;
          this.isDaytime = !!data.current.isDay;
          this.isLoading = false;
        },
        error: error => {
          console.error('Failed to fetch weather data.', error);
          this.isLoading = false;
        }
      });
  }

  openRiskModal(): void {
    this.isRiskModalOpen = true;
  }

  closeRiskModal(): void {
    this.isRiskModalOpen = false;
  }

  openNutrientModal(): void {
    this.isNutrientModalOpen = true;
  }

  closeNutrientModal(): void {
    this.isNutrientModalOpen = false;
  }

  openGrantModal(): void {
    this.isGrantModalOpen = true;
  }

  closeGrantModal(): void {
    this.isGrantModalOpen = false;
  }

  openAlternativeCropModal(crop: DashboardAlternativeCrop): void {
    this.selectedAlternativeCrop = crop;
    this.isAlternativeCropModalOpen = true;
  }

  closeAlternativeCropModal(): void {
    this.selectedAlternativeCrop = null;
    this.isAlternativeCropModalOpen = false;
  }

  openSensorHistory(sensor: DashboardSensor): void {
    this.selectedSensor = sensor;
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.selectedSensor = null;
  }

  onSensorHover(sensor: DashboardSensor): void {
    if (!this.lockedSensor) {
      this.hoveredSensor = sensor;
    }
  }

  onSensorLeave(): void {
    if (!this.lockedSensor) {
      this.hoveredSensor = null;
    }
  }

  togglePopup(sensor: DashboardSensor): void {
    if (this.lockedSensor?.id === sensor.id) {
      this.closePopup();
      return;
    }

    this.lockedSensor = sensor;
    this.hoveredSensor = sensor;
    this.activeSensorTab = 'hours';
  }

  closePopup(event?: Event): void {
    event?.stopPropagation();
    this.lockedSensor = null;
    this.hoveredSensor = null;
  }

  setSensorTab(tab: 'hours' | 'days' | 'weeks'): void {
    this.activeSensorTab = tab;
  }

  setActiveTab(tab: 'overview' | 'advisor'): void {
    this.activeTab = tab;
  }

  toggleChart(mode: 'hourly' | 'daily'): void {
    this.chartMode = mode;
  }

  openLink(url: string): void {
    if (url) {
      window.open(url, '_blank');
    }
  }

  downloadPdf(): void {
    // @ts-ignore
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const primaryGreen = '#2e7d32';
    const lightGreen = '#e8f5e9';
    const warningRed = '#dc2626';
    const waterStatus = this.getSensorDisplay('ndwi');
    const nutrientStatus = this.getSensorDisplay('ndre');
    const allocationStatus = `${this.decisionData.switch.allocationMatch}%`;
    const riskText = `${this.advisorData.riskLevel.toUpperCase()} RISK - ${this.advisorData.riskScore}%`;
    const projectedProfit = this.decisionData.switch.totalProfit + this.decisionData.keep.totalProfit;
    const currentLossAbs = Math.abs(this.decisionData.current.totalLoss);
    const improvement = currentLossAbs > 0
      ? Math.round(((projectedProfit + currentLossAbs) / currentLossAbs) * 100)
      : 0;

    doc.setFillColor(primaryGreen);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('PromaSecure Block Intelligence Plan', 105, 15, { align: 'center' });

    doc.setFontSize(14);
    doc.text(`${this.currentBlock?.name || 'Block'} - ${this.currentBlock?.crop || 'Crop'} - ${this.decisionData.totalArea}ha Plan`, 105, 25, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Last updated: ${this.advisorData.lastUpdated}`, 105, 33, { align: 'center' });

    let yPos = 50;
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen);
    doc.text('BLOCK INSIGHT SUMMARY', 14, yPos);
    yPos += 5;

    // @ts-ignore
    doc.autoTable({
      startY: yPos,
      head: [['Water Status', 'Nutrient Status', 'Allocation']],
      body: [[waterStatus, nutrientStatus, allocationStatus]],
      foot: [[
        this.getSensorSummary('ndwi'),
        this.nutrientData.status.toUpperCase(),
        this.decisionData.switch.validated ? 'VALIDATED' : 'REVIEW'
      ]],
      theme: 'grid',
      headStyles: { fillColor: primaryGreen, halign: 'center' },
      bodyStyles: { halign: 'center', fontSize: 12 },
      footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold' },
      styles: { cellPadding: 2 }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    doc.setFillColor(primaryGreen);
    doc.roundedRect(14, yPos, 182, 25, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`RECOMMENDED ${this.decisionData.totalArea}ha PILOT`, 105, yPos + 10, { align: 'center' });

    doc.setFontSize(12);
    const projectedProfitMillions = projectedProfit / 1000000;
    doc.text(
      `${this.decisionData.switch.area}ha ${this.decisionData.switch.crop.toUpperCase()} + ${this.decisionData.keep.area}ha ${this.decisionData.keep.crop.toUpperCase()} = $${projectedProfitMillions.toFixed(2)}M ANNUAL PROFIT`,
      105,
      yPos + 18,
      { align: 'center' }
    );

    yPos += 35;

    doc.setFontSize(12);
    doc.setTextColor(warningRed);
    doc.text(
      `vs Current Crop: ${this.formatCurrency(this.decisionData.current.totalLoss)} per year | ${improvement}% improvement potential`,
      105,
      yPos - 3,
      { align: 'center' }
    );

    yPos += 10;

    doc.setFontSize(14);
    doc.setTextColor(primaryGreen);
    doc.text('DETAILED ACTION PLAN', 14, yPos);
    yPos += 5;

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Week-by-Week Execution', 14, yPos + 5);

    const actionRows = this.advisorData.actions.slice(0, 4).map((action, index) => ([
      `${index + 1}`,
      action.items[0] || action.label,
      action.severity.toUpperCase(),
      action.estimatedCost || '$0'
    ]));

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 8,
      head: [['Step', 'Action', 'Priority', 'Cost']],
      body: actionRows.length > 0 ? actionRows : [['1', 'Await fresh backend insight refresh', 'INFO', '$0']],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
      styles: { fontSize: 10, cellPadding: 2 }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.text('Crop Breakdown', 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 3,
      head: [['Crop', 'Hectares', 'Water ML/ha', 'Profit/ha', 'TOTAL PROFIT']],
      body: [
        [
          this.decisionData.switch.crop,
          `${this.decisionData.switch.area}ha`,
          `${this.alternativeCrops[0]?.waterRequirement ?? 0}`,
          `${this.formatCurrency(this.decisionData.switch.profitPerHa)}`,
          `${this.formatCurrency(this.decisionData.switch.totalProfit)}`
        ],
        [
          this.decisionData.keep.crop,
          `${this.decisionData.keep.area}ha`,
          'Current program',
          `${this.formatCurrency(this.decisionData.keep.profitPerHa)}`,
          `${this.formatCurrency(this.decisionData.keep.totalProfit)}`
        ],
        [
          'TOTAL PILOT',
          `${this.decisionData.totalArea}ha`,
          'Aligned to backend',
          `${this.formatCurrency(this.decisionData.keep.profitPerHa)}`,
          `${this.formatCurrency(projectedProfit)}`
        ]
      ],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
      footStyles: { fillColor: lightGreen, textColor: primaryGreen, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 2 }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('RISK ASSESSMENT', 14, yPos);

    doc.setFillColor(primaryGreen);
    doc.roundedRect(14, yPos + 3, 70, 15, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(riskText, 49, yPos + 12, { align: 'center' });

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Sources: Backend block insights, selected block metadata, and weather observations', 105, 285, { align: 'center' });
    doc.setTextColor(primaryGreen);
    doc.text(`Data freshness: ${this.advisorData.lastUpdated}`, 105, 290, { align: 'center' });

    doc.save(`Promasecure_Plan_${this.currentBlock?.name || 'Block'}_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  private getSensorDisplay(id: DashboardMetricKey): string {
    const sensor = this.findSensorById(id);
    return sensor ? `${sensor.value}${sensor.unit}` : '--';
  }

  private getSensorSummary(id: DashboardMetricKey): string {
    const sensor = this.findSensorById(id);
    return sensor?.summaryLabel.toUpperCase() || 'UNKNOWN';
  }

  getSensorValue(label: string): number | string {
    const sensor = this.sensors.find(item => item.label === label);
    return sensor?.value ?? 'N/A';
  }

  formatCurrency(value: number): string {
    const absValue = Math.abs(value);
    const prefix = value < 0 ? '-$' : '$';

    if (absValue >= 1000000) {
      return `${prefix}${(absValue / 1000000).toFixed(1)}M`;
    }

    if (absValue >= 1000) {
      return `${prefix}${(absValue / 1000).toFixed(1)}k`;
    }

    return `${prefix}${Math.round(absValue)}`;
  }

  formatHourlyLabels(times: string[]): string[] {
    return times.map(time => new Date(time).getHours() + ':00');
  }

  formatDailyLabels(dates: string[]): string[] {
    return dates.map(dateValue => new Date(dateValue).toLocaleDateString('en-US', { weekday: 'short' }));
  }

  getAverage(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  getMax(values: number[]): number {
    if (!values.length) return 0;
    return Math.max(...values);
  }
}
