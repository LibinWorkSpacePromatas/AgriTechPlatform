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
  DashboardInsightsResponse,
  DashboardActionItem,
  DashboardAlternativeCrop,
  DashboardApiService,
  DashboardDecisionData,
  DashboardMetric,
  DashboardMetricKey,
  DashboardTrendDirection,
  DashboardTrendSummary,
  DashboardYieldImpact
} from '../../core/services/dashboard-api.service';
import { SatelliteRefreshEvent, SatelliteRefreshEventsService } from '../../core/services/satellite-refresh-events.service';

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
  value: number | string;
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
  private refreshEventsSubscription?: Subscription;
  private pendingInsightReload = false;

  activeTab: 'overview' | 'advisor' = 'overview';
  chartMode: 'hourly' | 'daily' = 'hourly';
  activeSensorTab: 'recent' | 'daily' | 'weekly' = 'recent';

  weatherData: WeatherData | null = null;
  isDaytime = true;
  isLoading = false;
  isInsightsLoading = false;
  isInsightsRefreshing = false;
  isUsingFallbackData = false;
  dashboardWarningMessage: string | null = null;

  currentBlock: DashboardBlock | null = null;
  latestInsights: DashboardInsightsResponse | null = null;

  sensors: DashboardSensor[] = [];
  advisorData = {
    riskScore: 0,
    riskLevel: 'Low' as 'Low' | 'Moderate' | 'High',
    lastUpdated: 'Waiting for backend insight refresh',
    sensorAnalysis: [
      { label: 'CROP HEALTH', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Sprout, colorClass: 'good' },
      { label: 'WATER STATUS', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Droplets, colorClass: 'good' },
      { label: 'NUTRIENT STATUS', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Layers, colorClass: 'good' },
      { label: 'VEGETATION STRENGTH', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Leaf, colorClass: 'good' },
      { label: 'GROWTH DENSITY', value: '--', status: 'PENDING', message: 'Waiting for backend insights', icon: Grape, colorClass: 'good' }
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
    private dashboardApiService: DashboardApiService,
    private satelliteRefreshEventsService: SatelliteRefreshEventsService
  ) { }

  get insightsStatusLabel(): string {
    if (this.isInsightsLoading) {
      return 'Loading latest block intelligence';
    }

    if (this.isInsightsRefreshing) {
      return 'Checking for newly refreshed satellite data';
    }

    if (!this.latestInsights) {
      return 'Waiting for backend intelligence';
    }

    if (this.latestInsights.source === 'simulated') {
      return 'Simulated Data';
    }

    if (this.latestInsights.dataQuality === 'no_data') {
      return 'No real satellite data yet';
    }

    if (this.latestInsights.status === 'updating') {
      return 'Background refresh in progress';
    }

    if (this.latestInsights.status === 'stale') {
      return 'Showing stale cache while refresh runs';
    }

    return 'Real satellite intelligence';
  }

  get insightsLatencyLabel(): string {
    if (!this.latestInsights) {
      return 'Data latency unavailable';
    }

    return `Data retrieved in ${this.latestInsights.latencyMs} ms`;
  }

  get dataStatusTitle(): string {
    if (!this.latestInsights) {
      return 'Data Status';
    }

    if (this.latestInsights.source === 'simulated') {
      return 'Simulated Data';
    }

    if (this.latestInsights.dataQuality === 'no_data') {
      return 'No Real Data';
    }

    if (this.latestInsights.error || this.latestInsights.status !== 'fresh' || this.latestInsights.dataQuality !== 'good') {
      return 'Warning';
    }

    return 'Data Status';
  }

  get dataStatusMessage(): string {
    if (this.dashboardWarningMessage) {
      return this.dashboardWarningMessage;
    }

    if (!this.latestInsights) {
      return 'Satellite intelligence is loading for the selected block.';
    }

    if (this.latestInsights.source === 'simulated') {
      return 'Simulated Data: the backend was unavailable, so no real satellite intelligence is being shown.';
    }

    if (this.latestInsights.dataQuality === 'no_data') {
      return 'No real satellite intelligence is available for the selected block yet. The dashboard is showing an empty state until a usable composite arrives.';
    }

    return 'This dashboard is using real satellite-backed block intelligence for the selected block.';
  }

  get showNoRealDataState(): boolean {
    if (!this.latestInsights) {
      return false;
    }

    return this.latestInsights.source === 'simulated' || this.latestInsights.dataQuality === 'no_data';
  }

  get currentSensorLabels(): string[] {
    const sensor = this.lockedSensor || this.hoveredSensor;
    if (!sensor) return [];

    switch (this.activeSensorTab) {
      case 'recent':
        return [...sensor.labelsHours];
      case 'daily':
        return [...sensor.labelsDays];
      case 'weekly':
        return [...sensor.labelsWeeks];
      default:
        return [...sensor.labelsHours];
    }
  }

  get currentSensorData(): number[] {
    const sensor = this.lockedSensor || this.hoveredSensor;
    if (!sensor) return [];

    switch (this.activeSensorTab) {
      case 'recent':
        return [...sensor.historyHours];
      case 'daily':
        return [...sensor.historyDays];
      case 'weekly':
        return [...sensor.historyWeeks];
      default:
        return [...sensor.historyHours];
    }
  }

  get hasSatelliteTrendData(): boolean {
    const populatedPoints = (this.latestInsights?.timeseries || []).filter(point => point.ndvi !== null || point.ndwi !== null);
    return populatedPoints.length >= 2;
  }

  get satelliteTrendLabels(): string[] {
    return (this.latestInsights?.timeseries || []).map(point => this.formatTimeseriesLabel(point.date));
  }

  get satelliteTrendSeries(): ChartSeries[] {
    if (!this.latestInsights) {
      return [];
    }

    const ndviPoints = this.latestInsights.timeseries.map(point => point.ndvi);
    const ndwiPoints = this.latestInsights.timeseries.map(point => point.ndwi);
    const hasNdvi = ndviPoints.some(point => point !== null);
    const hasNdwi = ndwiPoints.some(point => point !== null);

    const series: ChartSeries[] = [];

    if (hasNdvi) {
      series.push({
        name: 'NDVI',
        data: ndviPoints.map(point => point ?? 0),
        color: '#16a34a',
        unit: ''
      });
    }

    if (hasNdwi) {
      series.push({
        name: 'NDWI',
        data: ndwiPoints.map(point => point ?? 0),
        color: '#0284c7',
        unit: ''
      });
    }

    return series;
  }

  get satelliteTrendSummary(): DashboardTrendSummary | null {
    return this.latestInsights?.trends || null;
  }

  get satelliteTrendLastUpdated(): string {
    const latestDate = this.latestInsights?.trends.latestDate;
    return latestDate ? this.formatInsightsTimestamp(latestDate) : 'No historical observations yet';
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
        this.pendingInsightReload = false;
        this.subscribeToSatelliteRefreshEvents(this.currentBlock);
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
    this.refreshEventsSubscription?.unsubscribe();
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

  private loadBlockInsights(
    block: DashboardBlock,
    options: { preserveState?: boolean; backgroundRefresh?: boolean } = {}
  ): void {
    const preserveState = options.preserveState ?? false;
    const backgroundRefresh = options.backgroundRefresh ?? false;

    if (preserveState) {
      this.isInsightsRefreshing = true;
    } else {
      this.isInsightsLoading = true;
      this.prepareInsightsLoadState();
    }

    this.insightsRequest?.unsubscribe();

    this.insightsRequest = this.dashboardApiService.getBlockInsights(block.lan || block.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: insights => {
          this.applyInsights(block, insights);
          this.isInsightsLoading = false;
          this.isInsightsRefreshing = false;
          this.flushPendingInsightReload(block);
        },
        error: error => {
          console.error('Dashboard insights request failed unexpectedly.', error);
          if (!preserveState) {
            this.dashboardWarningMessage = 'Unable to load backend dashboard insights.';
            this.isUsingFallbackData = true;
          } else if (backgroundRefresh && !this.dashboardWarningMessage) {
            this.dashboardWarningMessage = 'Unable to check for a newer satellite refresh. Showing the latest successful result.';
          }
          this.isInsightsLoading = false;
          this.isInsightsRefreshing = false;
          this.flushPendingInsightReload(block);
        }
      });
  }

  private subscribeToSatelliteRefreshEvents(block: DashboardBlock): void {
    this.refreshEventsSubscription?.unsubscribe();
    this.refreshEventsSubscription = this.satelliteRefreshEventsService.watchBlock(block.lan || block.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => this.handleSatelliteRefreshEvent(block, event));
  }

  private handleSatelliteRefreshEvent(block: DashboardBlock, event: SatelliteRefreshEvent): void {
    if (!this.currentBlock || this.currentBlock.lan !== block.lan) {
      return;
    }

    if (event.event === 'connected') {
      return;
    }

    if (event.event === 'queued' || event.event === 'running') {
      if (!this.isInsightsLoading) {
        this.isInsightsRefreshing = true;
      }
      return;
    }

    if (event.event === 'failed') {
      this.dashboardWarningMessage = event.error || 'Satellite refresh failed. Showing the latest successful result.';
    }

    if (this.isInsightsLoading) {
      this.pendingInsightReload = true;
      return;
    }

    this.loadBlockInsights(block, { preserveState: true, backgroundRefresh: true });
  }

  private prepareInsightsLoadState(): void {
    this.latestInsights = null;
    this.dashboardWarningMessage = null;
    this.isUsingFallbackData = false;
    this.isInsightsRefreshing = false;
    this.sensors = [];
    this.hoveredSensor = null;
    this.lockedSensor = null;
    this.selectedSensor = null;
  }

  private applyInsights(block: DashboardBlock, insights: DashboardInsightsResponse): void {
    const previousHoveredId = this.hoveredSensor?.id;
    const previousLockedId = this.lockedSensor?.id;
    const previousSelectedId = this.selectedSensor?.id;

    this.latestInsights = insights;
    this.isUsingFallbackData = insights.source === 'simulated' || insights.dataQuality === 'no_data' || !!insights.error || insights.status !== 'fresh' || insights.dataQuality !== 'good';
    this.dashboardWarningMessage = insights.warning;

    this.sensors = this.mapMetricsToSensors(insights.metrics);
    this.hoveredSensor = this.findSensorById(previousHoveredId);
    this.lockedSensor = this.findSensorById(previousLockedId);
    this.selectedSensor = this.findSensorById(previousSelectedId);

    this.advisorData = {
      riskScore: insights.advisor.riskScore,
      riskLevel: insights.advisor.riskLevel,
      lastUpdated: this.formatInsightsTimestamp(insights.compositeDateTo || ''),
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

  private flushPendingInsightReload(block: DashboardBlock): void {
    if (!this.pendingInsightReload) {
      return;
    }

    this.pendingInsightReload = false;
    this.loadBlockInsights(block, { preserveState: true, backgroundRefresh: true });
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
        area: decision.switch.area || block.area,
        profitPerHa: decision.switch.profitPerHa,
        totalProfit: decision.switch.totalProfit,
        allocationMatch: decision.switch.allocationMatch,
        validated: decision.switch.validated,
        validationText: decision.switch.validationText
      },
      keep: {
        crop: resolveCropName(decision.keep.crop, block.crop),
        area: decision.keep.area || block.area,
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
        suggestedMin: key === 'ndwi' ? -100 : 0,
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
    if (label.includes('VEGETATION')) return Leaf;
    if (label.includes('GROWTH')) return Grape;
    return Sprout;
  }

  private formatInsightsTimestamp(timestamp: string): string {
    const date = this.parseDateValue(timestamp);
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
    this.activeSensorTab = 'recent';
  }

  closePopup(event?: Event): void {
    event?.stopPropagation();
    this.lockedSensor = null;
    this.hoveredSensor = null;
  }

  setSensorTab(tab: 'recent' | 'daily' | 'weekly'): void {
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
    const alertOrange = '#d97706';
    const riskText = `${this.advisorData.riskLevel.toUpperCase()} RISK - ${this.advisorData.riskScore}%`;
    const dataStatus = this.latestInsights
      ? `${this.latestInsights.status.toUpperCase()} / ${this.latestInsights.source.toUpperCase()} / ${this.latestInsights.dataQuality.toUpperCase()}`
      : 'LOADING';
    const metricRows = this.sensors.map(sensor => ([
      sensor.label,
      `${sensor.value}${sensor.unit}`,
      sensor.summaryLabel,
      sensor.message
    ]));
    const actionRows = this.advisorData.actions.map((action, index) => ([
      `${index + 1}`,
      action.label,
      action.items[0] || 'Review latest intelligence.',
      action.severity.toUpperCase()
    ]));

    doc.setFillColor(primaryGreen);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('PromaSecure Satellite Intelligence Report', 105, 15, { align: 'center' });

    doc.setFontSize(14);
    doc.text(`${this.currentBlock?.name || 'Block'} - ${this.currentBlock?.crop || 'Crop'}`, 105, 25, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Last updated: ${this.advisorData.lastUpdated}`, 105, 33, { align: 'center' });

    let yPos = 50;
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen);
    doc.text('BLOCK INTELLIGENCE SUMMARY', 14, yPos);
    yPos += 5;

    // @ts-ignore
    doc.autoTable({
      startY: yPos,
      head: [['Data Status', 'Latency', 'Risk Score']],
      body: [[dataStatus, this.insightsLatencyLabel, riskText]],
      foot: [[
        this.latestInsights?.warning || 'Backend intelligence active',
        this.nutrientData.status.toUpperCase(),
        this.latestInsights?.error || 'No blocking backend errors'
      ]],
      theme: 'grid',
      headStyles: { fillColor: primaryGreen, halign: 'center' },
      bodyStyles: { halign: 'center', fontSize: 12 },
      footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold' },
      styles: { cellPadding: 2 }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 15;

    doc.setFillColor(alertOrange);
    doc.roundedRect(14, yPos, 182, 25, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CURRENT RESPONSE POSTURE', 105, yPos + 10, { align: 'center' });

    doc.setFontSize(12);
    doc.text(
      this.dashboardWarningMessage || 'Monitoring backend intelligence and current weather context for the selected block.',
      105,
      yPos + 18,
      { align: 'center' }
    );

    yPos += 35;

    doc.setFontSize(12);
    doc.setTextColor(alertOrange);
    doc.text(
      `Composite vitality: ${this.yieldImpact?.currentYieldPercent.toFixed(0) ?? '--'}% | Nutrient score: ${this.nutrientData.score}%`,
      105,
      yPos - 3,
      { align: 'center' }
    );

    yPos += 10;

    doc.setFontSize(14);
    doc.setTextColor(primaryGreen);
    doc.text('KEY SIGNALS', 14, yPos);
    yPos += 5;

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Current metric values from the backend intelligence endpoint', 14, yPos + 5);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 8,
      head: [['Metric', 'Value', 'State', 'Message']],
      body: metricRows.length > 0 ? metricRows : [['No metrics', '--', 'WAITING', 'Awaiting backend intelligence']],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
      styles: { fontSize: 10, cellPadding: 2 }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.text('ACTION CHECKLIST', 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 3,
      head: [['Step', 'Focus', 'Action', 'Severity']],
      body: actionRows.length > 0 ? actionRows : [['1', 'Monitoring', 'Await backend refresh completion', 'INFO']],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
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
    doc.text(`Data freshness: ${dataStatus}`, 105, 290, { align: 'center' });

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
    const aliases: Record<string, string[]> = {
      'Water Status': ['Water Status'],
      'Nutrient Status': ['Nutrient Status'],
      'Crop Health': ['Crop Health'],
      'Canopy Density': ['Vegetation Strength', 'Growth Density'],
      'Vegetation Strength': ['Vegetation Strength'],
      'Growth Density': ['Growth Density']
    };

    const sensor = this.sensors.find(item => (aliases[label] || [label]).includes(item.label));
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
    return dates.map(dateValue => {
      const parsed = this.parseDateValue(dateValue);
      if (Number.isNaN(parsed.getTime())) {
        return dateValue;
      }

      return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
  }

  formatTimeseriesLabel(dateValue: string): string {
    const parsed = this.parseDateValue(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    if (dateValue.includes('T')) {
      return parsed.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }

    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatInsightsDate(timestamp: string): string {
    const date = this.parseDateValue(timestamp);
    if (Number.isNaN(date.getTime())) {
      return timestamp;
    }

    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getAverage(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  getMax(values: number[]): number {
    if (!values.length) return 0;
    return Math.max(...values);
  }

  getTrendBadgeClass(direction: DashboardTrendDirection | undefined): string {
    if (direction === 'improving') return 'good';
    if (direction === 'declining') return 'error';
    if (direction === 'stable') return 'warning';
    return 'neutral';
  }

  getTrendLabel(direction: DashboardTrendDirection | undefined): string {
    if (direction === 'improving') return 'Improving';
    if (direction === 'declining') return 'Declining';
    if (direction === 'stable') return 'Stable';
    return 'Collecting';
  }

  getSensorTrendSummary(sensor: DashboardSensor | null): string {
    if (!sensor) {
      return 'No metric selected';
    }

    if (sensor.id === 'ndvi' && this.latestInsights?.trends) {
      return this.latestInsights.trends.ndvi.message;
    }

    if (sensor.id === 'ndwi' && this.latestInsights?.trends) {
      return this.latestInsights.trends.ndwi.message;
    }

    if (sensor.historyDays.length <= 1) {
      return 'Historical trend is not available for this metric yet.';
    }

    const delta = sensor.historyDays[sensor.historyDays.length - 1] - sensor.historyDays[0];
    if (Math.abs(delta) < 1) {
      return `${sensor.label} is stable across the available history.`;
    }

    return `${sensor.label} is ${delta > 0 ? 'improving' : 'declining'} across the available history.`;
  }

  private parseDateValue(value: string): Date {
    return new Date(value.includes('T') ? value : `${value}T00:00:00`);
  }
}
