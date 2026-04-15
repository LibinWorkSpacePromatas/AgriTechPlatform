import { AfterViewInit, Component, ElementRef, HostListener, Inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { distinctUntilChanged, filter, interval, Subject, Subscription, takeUntil } from 'rxjs';
import {
  AlertTriangle,
  Beaker,
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
import * as L from 'leaflet';
import {
  DashboardInsightsResponse,
  DashboardApiService,
  DashboardMetric,
  DashboardMetricKey,
  DashboardTrendDirection,
  DashboardTrendSummary
} from '../../core/services/dashboard-api.service';
import {
  BlockIotSensorsResponse,
  IotSensorHistoryPoint,
  IotSensorStatus,
  IotSensorType,
  IotSensorsApiService
} from '../../core/services/iot-sensors-api.service';
import { SatelliteRefreshEvent, SatelliteRefreshEventsService } from '../../core/services/satellite-refresh-events.service';
import { CropAdvisorService, FarmerAdvisory, FarmerAdvisoryTone, FarmerSignalCard, ProfitRiskAdvisoryData, SensorData } from '../../core/services/crop-advisor.service';
import { RentalRecommendationResponse, RentalService } from '../../services/rental/rental.service';
import { environment } from '../../../environments/environment';

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
  raw: number | null;
  value: number | string;
  unit: string;
  status: 'Normal' | 'Low' | 'High';
  icon: any;
  summaryLabel: string;
  message: string;
  colorClass: 'good' | 'warning' | 'error';
  history: Array<number | null>;
  historyLabels: string[];
  historyHours: Array<number | null>;
  labelsHours: string[];
  historyDays: Array<number | null>;
  labelsDays: string[];
  historyWeeks: Array<number | null>;
  labelsWeeks: string[];
  suggestedMin?: number;
  suggestedMax?: number;
}

interface IotDashboardSensor {
  sensorId: string;
  sensorType: IotSensorType;
  label: string;
  value: number;
  unit: string;
  displayUnit: string;
  status: IotSensorStatus;
  icon: any;
  observedAt: string;
  historyHours: number[];
  labelsHours: string[];
  historyDays: number[];
  labelsDays: string[];
  historyWeeks: number[];
  labelsWeeks: string[];
  suggestedMin?: number;
  suggestedMax?: number;
}

interface SatelliteTrendChartPoint {
  dateKey: string;
  ndvi: number | null;
  ndwi: number | null;
  ndre: number | null;
  evi: number | null;
}

type SatelliteTrendSeriesKey = keyof Omit<SatelliteTrendChartPoint, 'dateKey'>;

interface DashboardProfitRiskScenarioMargins {
  low: number;
  current: number;
  high: number;
  selected: number;
}

interface DashboardProfitRiskCropRow {
  crop: string;
  commodity: string;
  current_price: number;
  break_even_price: number;
  price_trend: string;
  yield_t_ha: number;
  water_req_ml_ha: number;
  cost_per_unit: number;
  margins: DashboardProfitRiskScenarioMargins;
}

interface DashboardProfitRiskCurrentCrop {
  requested_crop: string;
  matched_crop: string;
  commodity: string;
  match_type: string;
  note: string | null;
  current_price: number;
  break_even_price: number;
  price_trend: string;
  yield_t_ha: number;
  water_req_ml_ha: number;
  net_margin: number;
}

interface DashboardProfitRiskResponse {
  block_id: string;
  block_name: string;
  block_crop: string;
  water_price: number;
  net_margin: number;
  risk_level: string;
  best_crop: string;
  best_crop_margin: number;
  updated_at: string;
  current_crop: DashboardProfitRiskCurrentCrop;
  margins: DashboardProfitRiskCropRow[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, LineChartComponent, ModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css', './dashboard-premium.component.css', './dashboard-alt-modal.component.css', './dashboard-action-cards.component.css']
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('detailPanel') detailPanelRef?: ElementRef<HTMLElement>;
  @ViewChild('ndviMapContainer') ndviMapContainerRef?: ElementRef<HTMLElement>;

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
  private profitRiskRequest?: Subscription;
  private iotSensorsRequest?: Subscription;
  private refreshEventsSubscription?: Subscription;
  private iotSensorInterval?: Subscription;
  private pendingInsightReload = false;

  activeTab: 'overview' | 'advisor' = 'overview';
  chartMode: 'hourly' | 'daily' | 'forecast' = 'hourly';
  activeSensorTab: 'recent' | 'daily' | 'weekly' = 'recent';
  activeIotSensorTab: 'recent' | 'daily' | 'weekly' = 'recent';

  weatherData: WeatherData | null = null;
  isDaytime = true;
  isLoading = false;
  isInsightsLoading = false;
  isInsightsRefreshing = false;
  isUsingFallbackData = false;
  dashboardWarningMessage: string | null = null;

  currentBlock: DashboardBlock | null = null;
  latestInsights: DashboardInsightsResponse | null = null;
  profitRiskData: DashboardProfitRiskResponse | null = null;
  readonly interpretationWaterPrice = 153;

  private readonly isBrowser: boolean;
  private ndviMap?: L.Map;
  private ndviBaseLayer?: L.TileLayer;
  private ndviTileLayer?: L.TileLayer;
  private ndviPolygonLayer?: L.GeoJSON;
  private ndviCentroidMarker?: L.CircleMarker;

  sensors: DashboardSensor[] = [];
  iotSensors: IotDashboardSensor[] = [];
  isIotSensorsLoading = false;
  iotSensorErrorMessage: string | null = null;
  farmerAdvisory: FarmerAdvisory | null = null;
  rentalRecommendation: RentalRecommendationResponse | null = null;
  private readonly requiredSignalValueKeys = new Set<string>();

  hoveredSensor: DashboardSensor | null = null;
  lockedSensor: DashboardSensor | null = null;
  selectedSensor: DashboardSensor | null = null;
  selectedIotSensor: IotDashboardSensor | null = null;
  isModalOpen = false;
  isIotSensorModalOpen = false;
  isSatelliteDataPopoverOpen = false;
  isTrendDataFromPopoverOpen = false;

  constructor(
    private http: HttpClient,
    public weatherService: WeatherService,
    private blockService: BlockService,
    private dashboardApiService: DashboardApiService,
    private iotSensorsApiService: IotSensorsApiService,
    private cropAdvisorService: CropAdvisorService,
    private satelliteRefreshEventsService: SatelliteRefreshEventsService,
    private rentalService: RentalService,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  get insightsStatusLabel(): string {
    if (this.isInsightsLoading && !this.latestInsights) {
      return 'Loading latest block intelligence';
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

    if (this.isInsightsRefreshing || this.latestInsights.status === 'updating') {
      return 'Refreshing in the background';
    }

    return this.formatLatencyLabel(this.latestInsights.latencyMs);
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

    if (this.latestInsights.dataQuality === 'degraded') {
      return 'This dashboard is using a degraded satellite composite. Review the data quality panel before making field decisions.';
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
    const sensor = this.activeDetailSensor;
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

  get currentSensorData(): Array<number | null> {
    const sensor = this.activeDetailSensor;
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

  get currentSensorPointColors(): string[] {
    const sensor = this.activeDetailSensor;
    if (!sensor) {
      return [];
    }

    return this.currentSensorData.map(value => {
      const tone = this.getDetailValueToneClass(sensor, value);
      if (tone === 'detail-tone-error') {
        return '#dc2626';
      }

      return '#15803d';
    });
  }

  get currentSensorHasData(): boolean {
    return this.currentSensorData.some(value => typeof value === 'number');
  }

  get currentIotSensorLabels(): string[] {
    const sensor = this.selectedIotSensor;
    if (!sensor) return [];

    switch (this.activeIotSensorTab) {
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

  get currentIotSensorData(): number[] {
    const sensor = this.selectedIotSensor;
    if (!sensor) return [];

    switch (this.activeIotSensorTab) {
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

  get currentIotSensorHasData(): boolean {
    return this.currentIotSensorData.length > 0;
  }

  get primarySensor(): DashboardSensor | null {
    return this.findSensorById('ndvi');
  }

  get activeDetailSensor(): DashboardSensor | null {
    return this.lockedSensor || this.primarySensor;
  }

  get secondarySensors(): DashboardSensor[] {
    return this.sensors.filter(sensor => sensor.id !== 'ndvi');
  }

  get dashboardLimitations(): string[] {
    return [...(this.latestInsights?.limitations || [])];
  }

  get ndviTrendMessage(): string {
    return this.latestInsights?.trends.ndvi.message || 'NDVI trend is still being collected.';
  }

  get ndviTrendDirection(): DashboardTrendDirection | undefined {
    return this.latestInsights?.trends.ndvi.direction;
  }

  get hasSatelliteTrendData(): boolean {
    return this.getSatelliteTrendPoints().filter(point =>
      point.ndvi !== null || point.ndwi !== null || point.ndre !== null || point.evi !== null
    ).length >= 2;
  }

  get satelliteTrendLabels(): string[] {
    return this.getSatelliteTrendPoints().map(point => this.formatTimeseriesLabel(point.dateKey));
  }

  get satelliteTrendSeries(): ChartSeries[] {
    const trendPoints = this.getSatelliteTrendPoints();
    if (!trendPoints.length) {
      return [];
    }

    const series: ChartSeries[] = [];
    const seriesConfig: Array<{ key: SatelliteTrendSeriesKey; name: string; color: string }> = [
      { key: 'ndvi', name: 'NDVI', color: '#15803d' },
      { key: 'ndwi', name: 'NDWI', color: '#0369a1' },
      { key: 'ndre', name: 'NDRE', color: '#7c3aed' },
      { key: 'evi', name: 'EVI', color: '#b45309' }
    ];

    seriesConfig.forEach(config => {
      const points = trendPoints.map(point => point[config.key]);
      if (points.some(point => point !== null)) {
        series.push({
          name: config.name,
          data: points,
          color: config.color,
          unit: ''
        });
      }
    });

    return series;
  }

  get satelliteTrendSummary(): DashboardTrendSummary | null {
    return this.latestInsights?.trends || null;
  }

  get satelliteTrendLastUpdated(): string {
    const latestDate = this.latestInsights?.lastSatelliteUpdate || this.latestInsights?.trends.latestDate;
    return latestDate ? this.formatInsightsTimestamp(latestDate) : 'No historical observations yet';
  }

  get dashboardFreshnessLabel(): string {
    const latestDate = this.latestInsights?.lastSatelliteUpdate || this.latestInsights?.compositeDateTo;
    return latestDate ? `Data from: ${this.formatInsightsDate(latestDate)}` : 'Data from: Waiting for satellite refresh';
  }

  get isNdviMapAvailable(): boolean {
    return !!this.latestInsights?.ndviTileUrl;
  }

  get dashboardMapTileUrl(): string | null {
    return this.latestInsights?.ndviTileUrl || null;
  }

  get showDegradedDataWarning(): boolean {
    if (!this.latestInsights || this.showNoRealDataState) {
      return false;
    }

    return this.latestInsights.dataQuality === 'degraded' || (this.latestInsights.cloudCoverPct ?? 0) > 50;
  }

  get degradedDataWarningMessage(): string {
    if (!this.latestInsights) {
      return 'Satellite data quality is still loading for this block.';
    }

    if (this.latestInsights.error) {
      return this.latestInsights.error;
    }

    if ((this.latestInsights.cloudCoverPct ?? 0) > 50) {
      return `Cloud cover is ${(this.latestInsights.cloudCoverPct ?? 0).toFixed(1)}%, so this composite is less reliable than a normal pass. Treat the current readings as provisional.`;
    }

    return 'This block is using a degraded satellite composite because cloud contamination or low usable pixels reduced confidence in the current pass.';
  }

  get mapOverlayLabel(): string {
    return 'NDVI overlay';
  }

  get mapAvailabilityLabel(): string {
    return this.isNdviMapAvailable ? `${this.mapOverlayLabel} available` : 'Block outline only';
  }

  get mapEmptyStateMessage(): string {
    if (!this.latestInsights) {
      return 'The dashboard is loading the latest NDVI overlay. The block outline will stay visible until the backend responds.';
    }

    if (this.latestInsights.status === 'updating') {
      return 'A fresh satellite refresh is in progress. The block outline is shown until the updated overlay is ready.';
    }

    if (this.latestInsights.dataQuality === 'no_data') {
      return 'No usable satellite composite is available for this block yet. The dashboard is showing only the block footprint.';
    }

    if (this.latestInsights.status === 'stale') {
      return 'The latest NDVI overlay tile is not available yet, so the dashboard is showing the block outline while the stale cache is refreshed.';
    }

    return `No ${this.mapOverlayLabel.toLowerCase()} tile is available for this block yet. The dashboard is showing the block footprint for spatial context.`;
  }

  get acquisitionDatesSummary(): string {
    const dates = this.latestInsights?.acquisitionMetadata.actualDates || [];
    if (!dates.length) {
      return 'No acquisition dates reported';
    }

    return dates.map(date => this.formatInsightsDate(date)).join(', ');
  }

  get currentRainAmount(): number {
    if (!this.weatherData) {
      return 0;
    }

    return this.weatherData.current.rain ?? this.weatherData.hourly.rain[0] ?? 0;
  }

  get currentBlockPrefix(): string {
    if (!this.currentBlock?.name) return '';
    return this.currentBlock.name.split(' - ')[0];
  }

  get chartDataSeries(): ChartSeries[] {
    if (!this.weatherData) return [];

    if (this.chartMode === 'hourly') {
      const recentHourly = this.getRecentHourlyWeather();
      return [
        {
          name: 'Temperature',
          data: recentHourly.temperature,
          color: '#f59e0b',
          unit: 'C'
        },
        {
          name: 'Feels Like',
          data: recentHourly.apparentTemperature,
          color: '#3b82f6',
          unit: 'C'
        }
      ];
    }

    if (this.chartMode === 'daily') {
      const recentDaily = this.getRecentDailyWeather();
      return [
        {
          name: 'Max Temp',
          data: recentDaily.maxTemperature,
          color: '#f59e0b',
          unit: 'C'
        },
        {
          name: 'Min Temp',
          data: recentDaily.minTemperature,
          color: '#3b82f6',
          unit: 'C'
        }
      ];
    }

    const forecastDaily = this.getForecastDailyWeather();
    return [
      {
        name: 'Max Temp',
        data: forecastDaily.maxTemperature,
        color: '#f59e0b',
        unit: 'C'
      },
      {
        name: 'Min Temp',
        data: forecastDaily.minTemperature,
        color: '#3b82f6',
        unit: 'C'
      }
    ];
  }

  get chartLabels(): string[] {
    if (!this.weatherData) return [];
    if (this.chartMode === 'hourly') {
      return this.formatHourlyLabels(this.getRecentHourlyWeather().times);
    }

    if (this.chartMode === 'daily') {
      return this.formatDailyLabels(this.getRecentDailyWeather().dates);
    }

    return this.formatForecastLabels(this.getForecastDailyWeather().dates);
  }

  get weatherChartSubtitle(): string {
    if (this.chartMode === 'forecast') {
      return 'The next 7 days of forecasted block weather to support scheduling and field planning.';
    }

    return 'Review recent weather history for the selected block.';
  }

  get forecastSummaryText(): string {
    const forecast = this.getForecastDailyWeather();
    if (!forecast.dates.length) {
      return 'Forecast data is loading for the next 7 days.';
    }

    const hottestDay = forecast.dates.reduce((bestIndex, date, index, dates) =>
      forecast.maxTemperature[index] > forecast.maxTemperature[bestIndex] ? index : bestIndex, 0);
    const wettestDay = forecast.dates.reduce((bestIndex, date, index, dates) =>
      forecast.precipitation[index] > forecast.precipitation[bestIndex] ? index : bestIndex, 0);
    const highestRainChanceDay = forecast.dates.reduce((bestIndex, date, index, dates) =>
      forecast.precipitationProbability[index] > forecast.precipitationProbability[bestIndex] ? index : bestIndex, 0);

    const hottestLabel = this.formatForecastDayName(forecast.dates[hottestDay]);
    const wettestLabel = this.formatForecastDayName(forecast.dates[wettestDay]);
    const highestRainChanceLabel = this.formatForecastDayName(forecast.dates[highestRainChanceDay]);
    const hottestTemp = forecast.maxTemperature[hottestDay];
    const wettestRain = forecast.precipitation[wettestDay];
    const rainChance = forecast.precipitationProbability[highestRainChanceDay];
    const condition = this.weatherService.getWeatherDescription(forecast.weatherCode[0]).toLowerCase();

    return `Forecast outlook: ${hottestLabel} is the warmest day at ${hottestTemp.toFixed(1)} C, ${wettestLabel} is expected to be the wettest at ${wettestRain.toFixed(1)} mm, and the highest rain chance is ${rainChance.toFixed(0)}% on ${highestRainChanceLabel}. The next forecast period begins with ${condition}.`;
  }

  private getRecentHourlyWeather(): {
    times: string[];
    temperature: number[];
    apparentTemperature: number[];
  } {
    if (!this.weatherData) {
      return { times: [], temperature: [], apparentTemperature: [] };
    }

    const currentTime = this.normalizeLocalDateTimeKey(this.weatherData.current.time);
    const rows = this.weatherData.hourly.time
      .map((time, index) => ({
        time,
        timestamp: this.normalizeLocalDateTimeKey(time),
        temperature: this.weatherData!.hourly.temperature_2m[index],
        apparentTemperature: this.weatherData!.hourly.apparent_temperature[index]
      }))
      .filter(row => row.timestamp <= currentTime)
      .slice(-24);

    return {
      times: rows.map(row => row.time),
      temperature: rows.map(row => row.temperature),
      apparentTemperature: rows.map(row => row.apparentTemperature)
    };
  }

  private getRecentDailyWeather(): {
    dates: string[];
    maxTemperature: number[];
    minTemperature: number[];
  } {
    if (!this.weatherData) {
      return { dates: [], maxTemperature: [], minTemperature: [] };
    }

    const todayKey = this.toDateKey(this.weatherData.current.time);
    const rows = this.weatherData.daily.time
      .map((date, index) => ({
        date,
        maxTemperature: this.weatherData!.daily.temperature_2m_max[index],
        minTemperature: this.weatherData!.daily.temperature_2m_min[index]
      }))
      .filter(row => this.toDateKey(row.date) <= todayKey)
      .slice(-7);

    return {
      dates: rows.map(row => row.date),
      maxTemperature: rows.map(row => row.maxTemperature),
      minTemperature: rows.map(row => row.minTemperature)
    };
  }

  private getForecastDailyWeather(): {
    dates: string[];
    maxTemperature: number[];
    minTemperature: number[];
    precipitation: number[];
    precipitationProbability: number[];
    weatherCode: number[];
  } {
    if (!this.weatherData) {
      return {
        dates: [],
        maxTemperature: [],
        minTemperature: [],
        precipitation: [],
        precipitationProbability: [],
        weatherCode: []
      };
    }

    const todayKey = this.toDateKey(this.weatherData.current.time);
    const rows = this.weatherData.daily.time
      .map((date, index) => ({
        date,
        maxTemperature: this.weatherData!.daily.temperature_2m_max[index],
        minTemperature: this.weatherData!.daily.temperature_2m_min[index],
        precipitation: this.weatherData!.daily.precipitation_sum[index],
        precipitationProbability: this.weatherData!.daily.precipitation_probability_max[index],
        weatherCode: this.weatherData!.daily.weather_code[index]
      }))
      .filter(row => this.toDateKey(row.date) >= todayKey)
      .slice(0, 7);

    return {
      dates: rows.map(row => row.date),
      maxTemperature: rows.map(row => row.maxTemperature),
      minTemperature: rows.map(row => row.minTemperature),
      precipitation: rows.map(row => row.precipitation),
      precipitationProbability: rows.map(row => row.precipitationProbability),
      weatherCode: rows.map(row => row.weatherCode)
    };
  }

  ngOnInit(): void {
    this.blockService.block$
      .pipe(
        takeUntil(this.destroy$),
        filter((block): block is SharedBlock => !!block),
        distinctUntilChanged((previous, current) => (previous.id || previous.lan) === (current.id || current.lan))
      )
      .subscribe(block => {
        this.currentBlock = this.mapSharedBlock(block);
        this.profitRiskData = null;
        this.pendingInsightReload = false;
        this.selectedIotSensor = null;
        this.isIotSensorModalOpen = false;
        this.subscribeToSatelliteRefreshEvents(this.currentBlock);
        this.loadProfitRisk(this.currentBlock);
        this.refreshWeather();
        this.loadBlockInsights(this.currentBlock);
        this.loadIotSensors(this.currentBlock);
        this.loadRentalRecommendation(this.currentBlock);
        this.queueNdviMapSync();
      });

    this.weatherInterval = interval(300000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshWeather());

    this.iotSensorInterval = interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.currentBlock) {
          this.loadIotSensors(this.currentBlock, { silent: true });
        }
      });
  }

  ngAfterViewInit(): void {
    this.queueNdviMapSync();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.weatherInterval?.unsubscribe();
    this.weatherRequest?.unsubscribe();
    this.insightsRequest?.unsubscribe();
    this.profitRiskRequest?.unsubscribe();
    this.iotSensorsRequest?.unsubscribe();
    this.refreshEventsSubscription?.unsubscribe();
    this.iotSensorInterval?.unsubscribe();
    this.teardownNdviMap();
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

    this.insightsRequest = this.dashboardApiService.getBlockInsights(block.id || block.lan)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: insights => {
          this.applyInsights(insights);
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
    this.refreshEventsSubscription = this.satelliteRefreshEventsService.watchBlock(block.id || block.lan)
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => this.handleSatelliteRefreshEvent(block, event));
  }

  private handleSatelliteRefreshEvent(block: DashboardBlock, event: SatelliteRefreshEvent): void {
    if (!this.currentBlock || (this.currentBlock.id || this.currentBlock.lan) !== (block.id || block.lan)) {
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
    this.farmerAdvisory = null;
    this.dashboardWarningMessage = null;
    this.isUsingFallbackData = false;
    this.isInsightsRefreshing = false;
    this.sensors = [];
    this.hoveredSensor = null;
    this.lockedSensor = null;
    this.selectedSensor = null;
  }

  private applyInsights(insights: DashboardInsightsResponse): void {
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
    this.rebuildFarmerAdvisory();
    this.queueNdviMapSync();
  }

  private flushPendingInsightReload(block: DashboardBlock): void {
    if (!this.pendingInsightReload) {
      return;
    }

    this.pendingInsightReload = false;
    this.loadBlockInsights(block, { preserveState: true, backgroundRefresh: true });
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
        raw: metric.raw,
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
        suggestedMin: key === 'lai' ? 0 : -1,
        suggestedMax: key === 'lai' ? 7 : 1
      };
    });
  }

  private loadIotSensors(block: DashboardBlock, options: { silent?: boolean } = {}): void {
    const silent = options.silent ?? false;
    if (!silent) {
      this.isIotSensorsLoading = true;
      this.iotSensorErrorMessage = null;
      this.iotSensors = [];
    }

    this.iotSensorsRequest?.unsubscribe();
    this.iotSensorsRequest = this.iotSensorsApiService.getBlockSensors(block.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.iotSensors = this.mapIotSensors(response);
          this.iotSensorErrorMessage = null;
          this.isIotSensorsLoading = false;
          this.rebuildFarmerAdvisory();

          if (this.selectedIotSensor) {
            this.selectedIotSensor = this.iotSensors.find(
              sensor => sensor.sensorId === this.selectedIotSensor?.sensorId
            ) || null;
            this.isIotSensorModalOpen = !!this.selectedIotSensor;
          }
        },
        error: error => {
          console.error('Failed to fetch IoT sensor readings.', error);
          this.iotSensorErrorMessage = 'IoT sensor readings are temporarily unavailable.';
          this.isIotSensorsLoading = false;
          this.rebuildFarmerAdvisory();
        }
      });
  }

  private loadRentalRecommendation(block: DashboardBlock): void {
    this.rentalRecommendation = null;
    this.rentalService.getRecommendations(block.lan || block.id).subscribe({
      next: recommendation => {
        this.rentalRecommendation = recommendation;
      },
      error: () => {
        this.rentalRecommendation = null;
      }
    });
  }

  private loadProfitRisk(block: DashboardBlock): void {
    this.profitRiskRequest?.unsubscribe();
    const blockId = block.lan || block.id;
    const url = `${environment.apiBaseUrl}/api/blocks/${blockId}/profit-risk?water_price=${this.interpretationWaterPrice}`;

    this.profitRiskRequest = this.http.get<DashboardProfitRiskResponse>(url)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.profitRiskData = response;
          this.rebuildFarmerAdvisory();
        },
        error: error => {
          console.error('Failed to fetch profit & risk data for dashboard interpretation.', error);
          this.profitRiskData = null;
          this.rebuildFarmerAdvisory();
        }
      });
  }

  private mapIotSensors(response: BlockIotSensorsResponse): IotDashboardSensor[] {
    return response.sensors.map(sensor => ({
      sensorId: sensor.sensor_id,
      sensorType: sensor.sensor_type,
      label: sensor.label,
      value: sensor.value,
      unit: sensor.unit,
      displayUnit: sensor.unit === 'C' ? '\u00B0C' : sensor.unit,
      status: sensor.status,
      icon: this.getIotSensorIcon(sensor.sensor_type),
      observedAt: sensor.observed_at,
      historyHours: sensor.histories.hourly.map(point => point.value),
      labelsHours: this.buildIotHistoryLabels(sensor.histories.hourly, 'recent'),
      historyDays: sensor.histories.daily.map(point => point.value),
      labelsDays: this.buildIotHistoryLabels(sensor.histories.daily, 'daily'),
      historyWeeks: sensor.histories.weekly.map(point => point.value),
      labelsWeeks: this.buildIotHistoryLabels(sensor.histories.weekly, 'weekly'),
      suggestedMin: sensor.suggested_min ?? undefined,
      suggestedMax: sensor.suggested_max ?? undefined
    }));
  }

  private buildIotHistoryLabels(
    points: IotSensorHistoryPoint[],
    mode: 'recent' | 'daily' | 'weekly'
  ): string[] {
    return points.map((point, index) => {
      const parsed = this.parseDateValue(point.observed_at);
      if (Number.isNaN(parsed.getTime())) {
        return point.observed_at;
      }

      const isLatest = index === points.length - 1;
      if (mode === 'recent') {
        if (isLatest) {
          return 'Now';
        }
        return parsed.toLocaleTimeString('en-US', {
          hour: 'numeric',
          hour12: false
        });
      }

      if (mode === 'daily') {
        if (isLatest) {
          return 'Today';
        }
        return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      return `Week of ${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    });
  }

  private getIotSensorIcon(sensorType: IotSensorType): any {
    const iconMap: Record<IotSensorType, any> = {
      soil_moisture: Droplets,
      soil_temperature: Thermometer,
      air_temperature: Wind,
      humidity: CloudRain,
      ph_level: Beaker
    };

    return iconMap[sensorType];
  }

  private formatIotDisplayUnit(unit: string): string {
    if (unit === 'C') {
      return '°C';
    }

    return unit;
  }

  private findSensorById(id?: DashboardMetricKey): DashboardSensor | null {
    if (!id) return null;
    return this.sensors.find(sensor => sensor.id === id) || null;
  }

  private rebuildFarmerAdvisory(): void {
    if (!this.currentBlock || !this.latestInsights || !this.profitRiskData) {
      this.requiredSignalValueKeys.clear();
      this.farmerAdvisory = null;
      return;
    }

    this.requiredSignalValueKeys.clear();
    this.farmerAdvisory = this.cropAdvisorService.buildFarmerAdvisory({
      currentCrop: this.currentBlock.crop || 'Shiraz',
      areaHa: this.currentBlock.area || 0,
      lastUpdated: this.formatInsightsTimestamp(this.latestInsights.lastSatelliteUpdate || this.latestInsights.compositeDateTo || ''),
      sensorData: this.buildAdvisorSensorData(),
      satelliteData: {
        ndvi: this.latestInsights.metrics.ndvi.raw,
        ndwi: this.latestInsights.metrics.ndwi.raw,
        ndre: this.latestInsights.metrics.ndre.raw,
        evi: this.latestInsights.metrics.evi.raw,
        lai: this.latestInsights.metrics.lai.raw
      },
      weatherData: this.weatherData,
      profitRiskData: this.mapProfitRiskAdvisoryData(this.profitRiskData)
    });
  }

  private mapProfitRiskAdvisoryData(data: DashboardProfitRiskResponse | null): ProfitRiskAdvisoryData | null {
    if (!data) {
      return null;
    }

    return {
      waterPrice: data.water_price,
      riskLevel: data.risk_level,
      currentCrop: {
        crop: data.current_crop.requested_crop,
        matchedCrop: data.current_crop.matched_crop,
        netMarginPerHa: data.current_crop.net_margin,
        waterReqMlHa: data.current_crop.water_req_ml_ha,
        note: data.current_crop.note
      },
      bestCrop: data.best_crop,
      bestCropMarginPerHa: data.best_crop_margin,
      margins: data.margins.map(row => ({
        crop: row.crop,
        netMarginPerHa: row.margins.selected,
        waterReqMlHa: row.water_req_ml_ha
      }))
    };
  }

  private buildAdvisorSensorData(): Partial<SensorData> {
    const sensorMap = this.iotSensors.reduce((map, sensor) => {
      map.set(sensor.sensorType, sensor.value);
      return map;
    }, new Map<IotSensorType, number>());

    return {
      moisture: sensorMap.get('soil_moisture'),
      ph: sensorMap.get('ph_level'),
      soilTemp: sensorMap.get('soil_temperature'),
      airTemp: sensorMap.get('air_temperature') ?? this.weatherData?.current.temperature,
      humidity: sensorMap.get('humidity') ?? this.weatherData?.current.relativeHumidity
    };
  }

  private getSatelliteTrendPoints(): SatelliteTrendChartPoint[] {
    if (!this.latestInsights?.timeseries.length) {
      return [];
    }

    const grouped = new Map<string, {
      dateKey: string;
      ndviTotal: number;
      ndviCount: number;
      ndwiTotal: number;
      ndwiCount: number;
      ndreTotal: number;
      ndreCount: number;
      eviTotal: number;
      eviCount: number;
    }>();

    this.latestInsights.timeseries.forEach(point => {
      const dateKey = this.toDateKey(point.observedOn || point.date);
      const existing = grouped.get(dateKey) || {
        dateKey,
        ndviTotal: 0,
        ndviCount: 0,
        ndwiTotal: 0,
        ndwiCount: 0,
        ndreTotal: 0,
        ndreCount: 0,
        eviTotal: 0,
        eviCount: 0
      };

      if (point.ndvi !== null) {
        existing.ndviTotal += point.ndvi;
        existing.ndviCount += 1;
      }

      if (point.ndwi !== null) {
        existing.ndwiTotal += point.ndwi;
        existing.ndwiCount += 1;
      }

      if (point.ndre !== null) {
        existing.ndreTotal += point.ndre;
        existing.ndreCount += 1;
      }

      if (point.evi !== null) {
        existing.eviTotal += point.evi;
        existing.eviCount += 1;
      }

      grouped.set(dateKey, existing);
    });

    return Array.from(grouped.values())
      .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
      .map(point => ({
        dateKey: point.dateKey,
        ndvi: point.ndviCount ? Number((point.ndviTotal / point.ndviCount).toFixed(4)) : null,
        ndwi: point.ndwiCount ? Number((point.ndwiTotal / point.ndwiCount).toFixed(4)) : null,
        ndre: point.ndreCount ? Number((point.ndreTotal / point.ndreCount).toFixed(4)) : null,
        evi: point.eviCount ? Number((point.eviTotal / point.eviCount).toFixed(4)) : null
      }));
  }

  getAdvisoryToneClass(tone: FarmerAdvisoryTone): string {
    if (tone === 'good') return 'advisor-tone-good';
    if (tone === 'warning') return 'advisor-tone-warning';
    if (tone === 'critical') return 'advisor-tone-critical';
    return 'advisor-tone-neutral';
  }

  getRecommendationScoreClass(score: number): string {
    if (score >= 80) return 'score-strong';
    if (score >= 60) return 'score-watch';
    return 'score-risk';
  }

  getInterpretationMetricTone(metric: 'currentProfit' | 'liveImpact' | 'riskLevel' | 'yield', advisory: FarmerAdvisory): string {
    switch (metric) {
      case 'currentProfit':
        if ((this.profitRiskData?.current_crop.net_margin ?? advisory.financial.estimatedCurrentProfit) < 0) {
          return 'value-tone-critical';
        }
        return advisory.financial.riskLevel === 'High' ? 'value-tone-warning' : 'value-tone-good';
      case 'liveImpact':
        if (this.getLiveImpactSeverity(advisory) === 'critical') return 'value-tone-critical';
        if (this.getLiveImpactSeverity(advisory) === 'warning') return 'value-tone-warning';
        return 'value-tone-good';
      case 'riskLevel':
        if (advisory.financial.riskLevel === 'High') return 'value-tone-critical';
        if (advisory.financial.riskLevel === 'Low') return 'value-tone-good';
        return 'value-tone-warning';
      case 'yield':
        return advisory.financial.currentYieldPercent >= 80 ? 'value-tone-good' : advisory.financial.currentYieldPercent >= 60 ? 'value-tone-warning' : 'value-tone-critical';
      default:
        return 'value-tone-neutral';
    }
  }

  getMigrationSummaryStatTone(metric: 'crop' | 'share' | 'projectedProfit' | 'gain', advisory: FarmerAdvisory): string {
    switch (metric) {
      case 'crop':
        return advisory.migrationSummary.recommendedCrop ? 'value-tone-warning' : 'value-tone-good';
      case 'share':
        if (advisory.migrationSummary.suggestedSharePct === 0) return 'value-tone-good';
        if (advisory.migrationSummary.suggestedSharePct <= 35) return 'value-tone-warning';
        return 'value-tone-critical';
      case 'projectedProfit':
        return advisory.migrationSummary.projectedProfitAfterMigration >= advisory.financial.estimatedCurrentProfit
          ? 'value-tone-good'
          : 'value-tone-critical';
      case 'gain':
        if (advisory.migrationSummary.gainVsCurrent > 0) return 'value-tone-good';
        if (advisory.migrationSummary.gainVsCurrent < 0) return 'value-tone-critical';
        return 'value-tone-neutral';
      default:
        return 'value-tone-neutral';
    }
  }

  getMigrationOptionStatTone(metric: 'profit' | 'lift' | 'water' | 'share', option: FarmerAdvisory['migrationOptions'][number]): string {
    const currentWaterNeed = this.currentBlock ? this.cropAdvisorService.getCropProfile(this.currentBlock.crop || '')?.waterRequirement ?? null : null;

    switch (metric) {
      case 'profit':
        if (option.expectedAnnualProfit > 0) return 'value-tone-good';
        if (option.expectedAnnualProfit < 0) return 'value-tone-critical';
        return 'value-tone-neutral';
      case 'lift':
        if (option.profitDelta > 0) return 'value-tone-good';
        if (option.profitDelta < 0) return 'value-tone-critical';
        return 'value-tone-neutral';
      case 'water':
        if (currentWaterNeed === null) return 'value-tone-neutral';
        if (option.waterRequirement < currentWaterNeed) return 'value-tone-good';
        if (option.waterRequirement > currentWaterNeed) return 'value-tone-critical';
        return 'value-tone-warning';
      case 'share':
        if (option.suggestedSharePct <= 20) return 'value-tone-warning';
        if (option.suggestedSharePct <= 35) return 'value-tone-warning';
        return 'value-tone-critical';
      default:
        return 'value-tone-neutral';
    }
  }

  getMigrationOptionProfitCaption(option: FarmerAdvisory['migrationOptions'][number]): string {
    return `Estimated result for a ${option.suggestedSharePct}% trial at the current water price`;
  }

  getSignalDisplayValue(signal: FarmerSignalCard, index: number): string {
    return this.isShowingRequiredSignalValue(signal, index)
      ? this.getSignalRequiredDisplayValue(signal)
      : signal.value;
  }

  getSignalDisplayValueClass(signal: FarmerSignalCard, index: number): string {
    return this.isShowingRequiredSignalValue(signal, index)
      ? 'signal-value-required'
      : this.getAdvisoryToneClass(signal.tone);
  }

  isShowingRequiredSignalValue(signal: FarmerSignalCard, index: number): boolean {
    return !!signal.required && this.requiredSignalValueKeys.has(this.getSignalCardKey(signal, index));
  }

  toggleRequiredSignalValue(signal: FarmerSignalCard, index: number): void {
    if (!signal.required) {
      return;
    }

    const cardKey = this.getSignalCardKey(signal, index);
    if (this.requiredSignalValueKeys.has(cardKey)) {
      this.requiredSignalValueKeys.delete(cardKey);
      return;
    }

    this.requiredSignalValueKeys.add(cardKey);
  }

  getSignalRequiredToggleLabel(signal: FarmerSignalCard, index: number): string {
    return this.isShowingRequiredSignalValue(signal, index)
      ? `Show current value for ${signal.label}`
      : `Show required value for ${signal.label}`;
  }

  getRiskLevelLabel(advisory: FarmerAdvisory): string {
    const currentMargin = this.profitRiskData?.current_crop.net_margin;
    const currentPrice = this.profitRiskData?.current_crop.current_price;
    const breakEvenPrice = this.profitRiskData?.current_crop.break_even_price;

    if (
      (typeof currentMargin === 'number' && currentMargin < 0)
      || (
        typeof currentPrice === 'number'
        && typeof breakEvenPrice === 'number'
        && currentPrice < breakEvenPrice
      )
      || advisory.financial.riskLevel === 'High'
    ) {
      return 'High risk';
    }
    if (advisory.financial.riskLevel === 'Low') {
      return 'Low risk';
    }
    return 'Watch closely';
  }

  getRiskLevelSummary(advisory: FarmerAdvisory): string {
    const currentMargin = this.profitRiskData?.current_crop.net_margin;
    const currentPrice = this.profitRiskData?.current_crop.current_price;
    const breakEvenPrice = this.profitRiskData?.current_crop.break_even_price;

    if (
      typeof currentMargin === 'number'
      && currentMargin < 0
      && typeof currentPrice === 'number'
      && typeof breakEvenPrice === 'number'
      && currentPrice < breakEvenPrice
    ) {
      return 'The margin is below zero and the current crop price is still below break-even.';
    }
    if (typeof currentMargin === 'number' && currentMargin < 0) {
      return 'The margin is below zero at the current water price, so returns are under pressure.';
    }
    if (
      typeof currentPrice === 'number'
      && typeof breakEvenPrice === 'number'
      && currentPrice < breakEvenPrice
    ) {
      return 'The current crop price is below break-even, so profitability is exposed.';
    }
    if (advisory.financial.riskLevel === 'Low') {
      return 'Current price and margin are sitting in a more stable range.';
    }
    return 'Returns should be watched as market and field conditions continue to change.';
  }

  getCurrentResultLabel(advisory: FarmerAdvisory): string {
    const perHaMargin = this.profitRiskData?.current_crop.net_margin;
    if (typeof perHaMargin === 'number') {
      return `${this.formatCurrency(perHaMargin)}/ha`;
    }

    return this.formatCurrency(advisory.financial.estimatedCurrentProfit);
  }

  getWaterPriceLabel(advisory: FarmerAdvisory): string {
    return `${this.formatCurrency(advisory.financial.waterPrice || this.interpretationWaterPrice)}/ML`;
  }

  getLiveImpactLabel(advisory: FarmerAdvisory): string {
    switch (this.getLiveImpactSeverity(advisory)) {
      case 'critical':
        return 'Needs attention';
      case 'warning':
        return 'Watch closely';
      default:
        return 'Mostly supportive';
    }
  }

  getLiveImpactSummary(advisory: FarmerAdvisory): string {
    const pressureSignals = advisory.signalCards.filter(signal => signal.tone === 'critical' || signal.tone === 'warning');
    const labels = pressureSignals.map(signal => signal.label);

    if (labels.includes('Soil moisture') && labels.includes('Water balance') && labels.includes('7-day rain')) {
      return 'Soil is too dry, satellite water stress is showing, and little rain is expected this week.';
    }
    if (labels.includes('Soil moisture') && labels.includes('Water balance')) {
      return 'Soil moisture is low and satellite water balance is confirming stress across the block.';
    }
    if (labels.includes('Soil moisture') && labels.includes('7-day rain')) {
      return 'Soil moisture is low and the forecast is not bringing enough rain to ease that pressure soon.';
    }
    if (labels.includes('Water balance') && labels.includes('Heat outlook')) {
      return 'Satellite water stress and the coming heat are both adding pressure on the crop.';
    }
    if (labels.includes('Soil pH')) {
      return 'Soil pH is outside the preferred range, so nutrient use may be less efficient right now.';
    }
    if (pressureSignals.length >= 2) {
      return `${pressureSignals[0].summary} ${pressureSignals[1].summary}`;
    }
    if (pressureSignals.length === 1) {
      return pressureSignals[0].summary;
    }
    return 'Sensors, satellite, and forecast are mostly supportive right now.';
  }

  private getSignalCardKey(signal: FarmerSignalCard, index: number): string {
    return `${index}:${signal.source}:${signal.label}`;
  }

  private getSignalRequiredDisplayValue(signal: FarmerSignalCard): string {
    if (!signal.required) {
      return signal.value;
    }

    switch (signal.label) {
      case 'Canopy health':
        return '0.50+';
      case 'Water balance':
        return '-0.05+';
      case 'Heat outlook':
        return '< 32.0°C';
      case '7-day rain':
        return '8.0+ mm';
      default:
        return signal.required;
    }
  }

  private getLiveImpactSeverity(advisory: FarmerAdvisory): 'good' | 'warning' | 'critical' {
    const criticalSignals = advisory.signalCards.filter(signal => signal.tone === 'critical').length;
    const warningSignals = advisory.signalCards.filter(signal => signal.tone === 'warning').length;

    if (criticalSignals >= 2 || (criticalSignals >= 1 && warningSignals >= 1)) {
      return 'critical';
    }
    if (criticalSignals >= 1 || warningSignals >= 2) {
      return 'warning';
    }
    return 'good';
  }

  formatCurrency(value: number): string {
    const formattedNumber = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0
    }).format(Math.abs(value));

    return `${value < 0 ? '-' : ''}$${formattedNumber}`;
  }

  private getPdfFitLabel(score: number): string {
    if (score >= 80) {
      return 'Strong fit';
    }

    if (score >= 60) {
      return 'Moderate fit';
    }

    return 'Needs attention';
  }

  private getPdfDataStatusLabel(): string {
    if (!this.latestInsights) {
      return 'Live data is still loading.';
    }

    if (this.latestInsights.dataQuality === 'no_data') {
      return 'Limited confidence because satellite data is not available yet.';
    }

    if (this.latestInsights.dataQuality === 'degraded' || this.latestInsights.status === 'stale') {
      return 'Use with care because the latest satellite image quality is reduced.';
    }

    return 'Based on the latest available live block data.';
  }

  private getPdfMigrationDecisionText(): string {
    const advisory = this.farmerAdvisory;
    if (!advisory) {
      return 'Migration decision is not available yet.';
    }

    if (!advisory.migrationSummary.recommendedCrop || advisory.migrationSummary.suggestedSharePct === 0) {
      return `Do not migrate yet. Keep ${this.currentBlock?.crop || 'the current crop'} and focus on improving field conditions.`;
    }

    return `Consider a phased migration of about ${advisory.migrationSummary.suggestedSharePct}% to ${advisory.migrationSummary.recommendedCrop}.`;
  }

  getIotSensorTooltip(observedAt: string): string {
    return `Last updated ${this.formatInsightsTimestamp(observedAt)}`;
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
          this.rebuildFarmerAdvisory();
        },
        error: error => {
          console.error('Failed to fetch weather data.', error);
          this.isLoading = false;
          this.rebuildFarmerAdvisory();
        }
      });
  }

  openSensorHistory(sensor: DashboardSensor): void {
    this.selectedSensor = sensor;
    this.isModalOpen = true;
  }

  openIotSensorHistory(sensor: IotDashboardSensor): void {
    this.selectedIotSensor = sensor;
    this.activeIotSensorTab = 'recent';
    this.isIotSensorModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.selectedSensor = null;
  }

  closeIotSensorModal(): void {
    this.isIotSensorModalOpen = false;
    this.selectedIotSensor = null;
  }

  toggleTrendDataFromPopover(event: Event): void {
    event.stopPropagation();
    this.isTrendDataFromPopoverOpen = !this.isTrendDataFromPopoverOpen;
  }

  closeTrendDataFromPopover(event?: Event): void {
    event?.stopPropagation();
    this.isTrendDataFromPopoverOpen = false;
  }

  toggleSatelliteDataPopover(event: Event): void {
    event.stopPropagation();
    this.isSatelliteDataPopoverOpen = !this.isSatelliteDataPopoverOpen;
  }

  closeSatelliteDataPopover(event?: Event): void {
    event?.stopPropagation();
    this.isSatelliteDataPopoverOpen = false;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isSatelliteDataPopoverOpen = false;
    this.isTrendDataFromPopoverOpen = false;
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
    this.hoveredSensor = null;
    this.activeSensorTab = 'recent';
    this.scrollToTrendPanel();
  }

  closePopup(event?: Event): void {
    event?.stopPropagation();
    this.lockedSensor = null;
    this.hoveredSensor = null;
    this.isTrendDataFromPopoverOpen = false;
  }

  private scrollToTrendPanel(): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.detailPanelRef?.nativeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      });
    });
  }

  setSensorTab(tab: 'recent' | 'daily' | 'weekly'): void {
    this.activeSensorTab = tab;
  }

  setIotSensorTab(tab: 'recent' | 'daily' | 'weekly'): void {
    this.activeIotSensorTab = tab;
  }

  setActiveTab(tab: 'overview' | 'advisor'): void {
    this.activeTab = tab;
    if (tab === 'overview') {
      this.queueNdviMapSync();
      return;
    }

    this.teardownNdviMap();
  }

  toggleChart(mode: 'hourly' | 'daily' | 'forecast'): void {
    this.chartMode = mode;
  }

  openLink(url: string): void {
    if (url) {
      window.open(url, '_blank');
    }
  }

  private queueNdviMapSync(): void {
    if (!this.isBrowser) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => this.syncNdviMap());
    });
  }

  private syncNdviMap(): void {
    if (!this.isBrowser || this.activeTab !== 'overview' || !this.currentBlock) {
      return;
    }

    const mapHost = this.ndviMapContainerRef?.nativeElement;
    if (!mapHost) {
      return;
    }

    if (!this.ndviMap) {
      this.ndviMap = L.map(mapHost, {
        zoomControl: true,
        attributionControl: true
      });
      this.ndviBaseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        minZoom: 3
      }).addTo(this.ndviMap);
    }

    this.renderNdviMapLayers();
    this.ndviMap.invalidateSize();
  }

  private renderNdviMapLayers(): void {
    if (!this.ndviMap || !this.currentBlock) {
      return;
    }

    if (this.ndviTileLayer) {
      this.ndviMap.removeLayer(this.ndviTileLayer);
      this.ndviTileLayer = undefined;
    }
    if (this.ndviPolygonLayer) {
      this.ndviMap.removeLayer(this.ndviPolygonLayer);
      this.ndviPolygonLayer = undefined;
    }
    if (this.ndviCentroidMarker) {
      this.ndviMap.removeLayer(this.ndviCentroidMarker);
      this.ndviCentroidMarker = undefined;
    }

    if (this.currentBlock.polygon) {
      this.ndviPolygonLayer = L.geoJSON(
        {
          type: 'Feature',
          geometry: this.currentBlock.polygon,
          properties: {
            name: this.currentBlock.name
          }
        } as any,
        {
          style: {
            color: '#166534',
            weight: 3,
            fillColor: '#22c55e',
            fillOpacity: 0.08
          }
        }
      ).addTo(this.ndviMap);

      const bounds = this.ndviPolygonLayer.getBounds();
      if (bounds.isValid()) {
        this.ndviMap.fitBounds(bounds.pad(0.2));
      }
    } else {
      this.ndviMap.setView([this.currentBlock.location.lat, this.currentBlock.location.lon], 16);
    }

    this.ndviCentroidMarker = L.circleMarker([this.currentBlock.location.lat, this.currentBlock.location.lon], {
      radius: 6,
      color: '#14532d',
      weight: 2,
      fillColor: '#22c55e',
      fillOpacity: 0.92
    })
      .bindPopup(`${this.currentBlock.name}<br>Block centroid`)
      .addTo(this.ndviMap);

    if (this.dashboardMapTileUrl) {
      this.ndviTileLayer = L.tileLayer(this.dashboardMapTileUrl, {
        opacity: 0.68,
        attribution: 'NDVI overlay © Sentinel-2 / Google Earth Engine'
      }).addTo(this.ndviMap);
    }
  }

  private teardownNdviMap(): void {
    if (!this.ndviMap) {
      return;
    }

    this.ndviMap.remove();
    this.ndviMap = undefined;
    this.ndviBaseLayer = undefined;
    this.ndviTileLayer = undefined;
    this.ndviPolygonLayer = undefined;
    this.ndviCentroidMarker = undefined;
  }

  downloadPdf(): void {
    if (!this.currentBlock || !this.farmerAdvisory) {
      return;
    }

    // @ts-ignore
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const advisory = this.farmerAdvisory;

    const primaryGreen = '#2e7d32';
    const gold = '#c58a2b';
    const softInk = '#475569';
    const sourceSummary = advisory.sources.join(', ');
    const dataStatus = this.getPdfDataStatusLabel();
    const signalRows = advisory.signalCards.map(signal => ([
      signal.label,
      signal.value,
      signal.summary
    ]));
    const overviewRows = [
      ['Block', this.currentBlock.name],
      ['Current crop', this.currentBlock.crop],
      ['Block size', `${this.currentBlock.area} ha`],
      ['Current crop fit', `${advisory.currentCropScore}/100 (${this.getPdfFitLabel(advisory.currentCropScore)})`],
      ['Confidence', advisory.financial.confidenceLabel],
      ['Report updated', advisory.lastUpdated]
    ];
    const moneyRows = [
      ['Current result', this.formatCurrency(advisory.financial.estimatedCurrentProfit)],
      ['Water price used', this.getWaterPriceLabel(advisory)],
      ['Profit & Risk status', this.getRiskLevelLabel(advisory)],
      ['Projected annual margin after the recommended plan', this.formatCurrency(advisory.migrationSummary.projectedProfitAfterMigration)],
      ['Expected change versus current position', this.formatCurrency(advisory.migrationSummary.gainVsCurrent)]
    ];
    const decisionRows = [
      ['Best current decision', this.getPdfMigrationDecisionText()],
      ['Main reason', advisory.migrationSummary.reason],
      ['How it helps', advisory.migrationSummary.benefits[0] || 'Improves margin and reduces field stress exposure.']
    ];
    const migrationRows = advisory.migrationOptions.map(option => ([
      option.cropName,
      `${option.suitabilityScore}/100`,
      `${this.formatCurrency(option.expectedAnnualProfit)} (full block)`,
      `${this.formatCurrency(option.trialAnnualProfit)} (${option.suggestedSharePct}% trial)`,
      `${option.waterRequirement.toFixed(1)} ML/ha`,
      option.whyItFits
    ]));
    const actionRows = advisory.actions.map((action, index) => ([
      `${index + 1}`,
      action.timing,
      action.title,
      action.detail
    ]));

    doc.setFillColor(primaryGreen);
    doc.rect(0, 0, 210, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('PromaSecure Crop Advice Report', 105, 14, { align: 'center' });

    doc.setFontSize(13);
    doc.text(`${this.currentBlock.name} - ${this.currentBlock.crop}`, 105, 23, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Updated: ${advisory.lastUpdated}`, 105, 31, { align: 'center' });

    let yPos = 46;
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryGreen);
    doc.text('1. Simple Summary', 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 4,
      head: [['Question', 'Answer']],
      body: overviewRows,
      theme: 'grid',
      headStyles: { fillColor: primaryGreen },
      bodyStyles: { fontSize: 10 },
      styles: { cellPadding: 3, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 58, fontStyle: 'bold' },
        1: { cellWidth: 122 }
      }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 10;

    doc.setFillColor(gold);
    doc.roundedRect(14, yPos, 182, 24, 4, 4, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('Main Advice For The Farmer', 105, yPos + 8, { align: 'center' });

    const summaryLines = doc.splitTextToSize(`${advisory.headline} ${advisory.summary}`, 168);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(summaryLines, 105, yPos + 15, { align: 'center' });

    yPos += Math.max(32, 17 + summaryLines.length * 5);

    doc.setFontSize(14);
    doc.setTextColor(primaryGreen);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Money View', 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 3,
      head: [['Money question', 'Estimated value']],
      body: moneyRows,
      theme: 'grid',
      headStyles: { fillColor: primaryGreen },
      bodyStyles: { fontSize: 10 },
      styles: { cellPadding: 3, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 98, fontStyle: 'bold' },
        1: { cellWidth: 82 }
      }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(14);
    doc.setTextColor(primaryGreen);
    doc.text('3. Stay Or Migrate?', 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 3,
      head: [['Decision question', 'Answer']],
      body: decisionRows,
      theme: 'grid',
      headStyles: { fillColor: primaryGreen },
      bodyStyles: { fontSize: 10 },
      styles: { cellPadding: 3, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 58, fontStyle: 'bold' },
        1: { cellWidth: 122 }
      }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(14);
    doc.setTextColor(primaryGreen);
    doc.text('4. Why We Are Saying This', 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 3,
      head: [['What we checked', 'Current reading', 'What it means for you']],
      body: signalRows.length > 0 ? signalRows : [['Live data', '--', 'The report will become more detailed after the next refresh.']],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
      styles: { fontSize: 10, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold' },
        1: { cellWidth: 32 },
        2: { cellWidth: 106 }
      }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(14);
    doc.setTextColor(primaryGreen);
    doc.text('5. Best Crop Options From Current Conditions', 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 3,
      head: [['Crop option', 'Fit score', 'Full-block profit', 'Trial-size profit', 'Water need', 'Why it may help']],
      body: migrationRows.length > 0 ? migrationRows : [['Current crop', '--', '--', '--', '--', 'No migration option is clearly better yet.']],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: 'bold' },
        1: { cellWidth: 18 },
        2: { cellWidth: 28 },
        3: { cellWidth: 28 },
        4: { cellWidth: 18 },
        5: { cellWidth: 64 }
      }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(14);
    doc.setTextColor(primaryGreen);
    doc.text('6. What To Do Next', 14, yPos);

    // @ts-ignore
    doc.autoTable({
      startY: yPos + 3,
      head: [['Step', 'When', 'Action', 'What to focus on']],
      body: actionRows.length > 0 ? actionRows : [['1', 'Next update', 'Wait for more data', 'Live data is still arriving']],
      theme: 'striped',
      headStyles: { fillColor: primaryGreen },
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 48, fontStyle: 'bold' },
        3: { cellWidth: 92 }
      }
    });

    // @ts-ignore
    yPos = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(13);
    doc.setTextColor(gold);
    doc.setFont('helvetica', 'bold');
    doc.text('7. Important Note', 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(softInk);
    const adviceLines = doc.splitTextToSize(
      `${dataStatus} This report uses ${sourceSummary}. It is meant to help farmers understand the current situation quickly and should be reviewed again whenever new live data arrives.`,
      180
    );
    doc.text(adviceLines, 14, yPos + 7);

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Data used: ${sourceSummary}`, 105, 285, { align: 'center' });
    doc.setTextColor(primaryGreen);
    doc.text('PromaSecure live farmer advisory', 105, 290, { align: 'center' });

    doc.save(`PromaSecure_Farmer_Advisory_${this.currentBlock.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  private getSensorDisplay(id: DashboardMetricKey): string {
    const sensor = this.findSensorById(id);
    return sensor ? `${sensor.value}${sensor.unit}` : '--';
  }

  private getSensorSummary(id: DashboardMetricKey): string {
    const sensor = this.findSensorById(id);
    return sensor?.summaryLabel.toUpperCase() || 'UNKNOWN';
  }

  formatHourlyLabels(times: string[]): string[] {
    const currentDateKey = this.weatherData ? this.toDateKey(this.weatherData.current.time) : null;
    const currentTimeKey = this.weatherData ? this.normalizeLocalDateTimeKey(this.weatherData.current.time) : null;

    return times.map((time, index) => {
      const includeDay = !!currentDateKey && this.toDateKey(time) !== currentDateKey;
      const isLatest = index === times.length - 1;
      const latestDisplayTime = isLatest && currentTimeKey ? currentTimeKey : time;
      return this.formatLocalHourLabel(latestDisplayTime, includeDay);
    });
  }

  formatDailyLabels(dates: string[]): string[] {
    return dates.map((dateValue, index) => {
      const parsed = this.parseDateValue(dateValue);
      if (Number.isNaN(parsed.getTime())) {
        return dateValue;
      }

      if (index === dates.length - 1) {
        return 'Today';
      }

      return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
  }

  formatForecastLabels(dates: string[]): string[] {
    return dates.map((dateValue, index) => {
      const parsed = this.parseDateValue(dateValue);
      if (Number.isNaN(parsed.getTime())) {
        return dateValue;
      }

      if (index === 0) {
        return 'Today';
      }

      return parsed.toLocaleDateString('en-US', { weekday: 'short' });
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

  getAverage(values: Array<number | null>): number {
    const numericValues = values.filter((value): value is number => typeof value === 'number');
    if (!numericValues.length) return 0;
    return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
  }

  getDetailValueToneClass(sensor: DashboardSensor | null, value: number | null): string {
    if (!sensor || value === null || Number.isNaN(value)) {
      return 'detail-tone-neutral';
    }

    switch (sensor.id) {
      case 'ndwi':
        if (value < -0.3) return 'detail-tone-error';
        if (value < -0.15) return 'detail-tone-warning';
        return 'detail-tone-good';
      case 'ndvi':
        if (value < 0.2) return 'detail-tone-error';
        if (value < 0.35) return 'detail-tone-warning';
        return 'detail-tone-good';
      case 'ndre':
        if (value < 0.25) return 'detail-tone-warning';
        return 'detail-tone-good';
      case 'lai':
        if (value < 2) return 'detail-tone-error';
        if (value > 5) return 'detail-tone-warning';
        return 'detail-tone-good';
      default:
        return this.getToneClassFromMetricState(sensor.colorClass);
    }
  }

  getDetailStatusToneClass(sensor: DashboardSensor | null): string {
    if (!sensor) {
      return 'detail-tone-neutral';
    }

    return this.getToneClassFromMetricState(sensor.colorClass);
  }

  private getToneClassFromMetricState(colorClass: DashboardSensor['colorClass']): string {
    switch (colorClass) {
      case 'error':
        return 'detail-tone-error';
      case 'warning':
        return 'detail-tone-warning';
      default:
        return 'detail-tone-good';
    }
  }

  getMax(values: Array<number | null>): number {
    const numericValues = values.filter((value): value is number => typeof value === 'number');
    if (!numericValues.length) return 0;
    return Math.max(...numericValues);
  }

  getTrendBadgeClass(direction: DashboardTrendDirection | undefined): string {
    if (direction === 'improving') return 'good';
    if (direction === 'declining') return 'error';
    if (direction === 'stable') return 'warning';
    return 'neutral';
  }

  getDataQualityBadgeClass(): 'good' | 'warning' | 'error' | 'neutral' {
    if (!this.latestInsights) {
      return 'neutral';
    }
    if (this.latestInsights.dataQuality === 'good') {
      return 'good';
    }
    if (this.latestInsights.dataQuality === 'degraded') {
      return 'warning';
    }
    if (this.latestInsights.dataQuality === 'no_data') {
      return 'error';
    }
    return 'neutral';
  }

  getSearchWindowSummary(): string {
    if (!this.latestInsights?.searchWindowFrom || !this.latestInsights?.searchWindowTo) {
      return 'Unavailable';
    }

    return `${this.formatInsightsDate(this.latestInsights.searchWindowFrom)} to ${this.formatInsightsDate(this.latestInsights.searchWindowTo)}`;
  }

  getAcquisitionSpanSummary(): string {
    if (!this.latestInsights?.compositeDateFrom || !this.latestInsights?.compositeDateTo) {
      return 'Unavailable';
    }

    return `${this.formatInsightsDate(this.latestInsights.compositeDateFrom)} to ${this.formatInsightsDate(this.latestInsights.compositeDateTo)}`;
  }

  formatCloudCoverLabel(value: number | null | undefined): string {
    if (typeof value !== 'number') {
      return 'Unavailable';
    }

    return `${value.toFixed(1)}%`;
  }

  getTrendLabel(direction: DashboardTrendDirection | undefined): string {
    if (direction === 'improving') return 'Improving';
    if (direction === 'declining') return 'Declining';
    if (direction === 'stable') return 'Stable';
    return 'Collecting';
  }

  getStatusToneClass(status: DashboardSensor['status'] | IotSensorStatus): string {
    if (status === 'Normal') return 'tone-good';
    if (status === 'Low') return 'tone-watch';
    return 'tone-alert';
  }

  getReadableStatus(sensor: DashboardSensor): string {
    if (sensor.status === 'Normal') {
      return 'Good';
    }

    if (sensor.status === 'Low') {
      return 'Needs watching';
    }

    return 'Needs action';
  }

  getFriendlySensorName(id: DashboardMetricKey): string {
    const names: Record<DashboardMetricKey, string> = {
      ndvi: 'Plant health',
      ndwi: 'Water balance',
      ndre: 'Nutrient activity',
      evi: 'Leaf strength',
      lai: 'Canopy cover'
    };

    return names[id];
  }

  getPlainLanguageSignal(id: DashboardMetricKey): string {
    const labels: Record<DashboardMetricKey, string> = {
      ndvi: 'Main crop signal',
      ndwi: 'Water support signal',
      ndre: 'Nutrient support signal',
      evi: 'Growth support signal',
      lai: 'Canopy support signal'
    };

    return labels[id];
  }

  getPrimaryHeadline(sensor: DashboardSensor): string {
    if (sensor.status === 'Normal') {
      return 'Crop growth looks steady today.';
    }

    if (sensor.status === 'Low') {
      return 'Crop growth is weaker than expected today.';
    }

    return 'Crop growth needs attention today.';
  }

  getPrimarySummary(sensor: DashboardSensor): string {
    if (sensor.status === 'Normal') {
      return 'The main plant-health signal is in a safer range. You can use the supporting cards below only if you want extra detail.';
    }

    if (sensor.status === 'Low') {
      return 'The main plant-health signal is below the ideal range. Check the supporting cards for likely pressure from water, nutrients, or canopy cover.';
    }

    return 'The main plant-health signal is outside the safer range. Review the supporting cards and interpretation tab before making field decisions.';
  }

  getSensorSupportMessage(sensor: DashboardSensor): string {
    if (sensor.message) {
      return sensor.message;
    }

    if (sensor.status === 'Normal') {
      return `${this.getFriendlySensorName(sensor.id)} looks stable.`;
    }

    if (sensor.status === 'Low') {
      return `${this.getFriendlySensorName(sensor.id)} is lower than expected.`;
    }

    return `${this.getFriendlySensorName(sensor.id)} needs closer review.`;
  }

  getWeatherSummary(): string {
    if (!this.weatherData) {
      return 'Weather data is loading for this block.';
    }

    const description = this.weatherService.getWeatherDescription(this.weatherData.current.weatherCode).toLowerCase();
    return `Current conditions: ${this.weatherData.current.temperature} deg C, feels like ${this.weatherData.current.apparentTemperature} deg C, ${description}, humidity ${this.weatherData.current.relativeHumidity}% and wind ${this.weatherData.current.windSpeed} m/s.`;
  }

  getWeatherFieldTip(): string {
    if (!this.weatherData) {
      return 'Refresh weather to see the latest field conditions.';
    }

    if (this.currentRainAmount > 2) {
      return 'Rain is present now. Delay spraying or field traffic if possible.';
    }

    if (this.weatherData.current.windSpeed >= 8) {
      return 'Wind is strong right now. Be careful with spraying and exposed irrigation work.';
    }

    if (this.weatherData.current.temperature >= 32) {
      return 'Heat is building. Watch irrigation timing and signs of crop stress.';
    }

    if (this.weatherData.current.relativeHumidity >= 85) {
      return 'Humidity is high. Keep an eye on disease pressure in dense canopy areas.';
    }

    return 'Conditions are fairly calm right now. Use the chart below to review recent weather and the next 7-day forecast.';
  }

  formatForecastDayName(dateValue: string): string {
    const parsed = this.parseDateValue(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    const todayKey = this.weatherData ? this.toDateKey(this.weatherData.current.time) : null;
    if (todayKey && this.toDateKey(dateValue) === todayKey) {
      return 'Today';
    }

    return parsed.toLocaleDateString('en-US', { weekday: 'long' });
  }

  getSensorTrendSummary(sensor: DashboardSensor | null): string {
    if (!sensor) {
      return 'No metric selected';
    }

    const trend = this.latestInsights?.trends?.[sensor.id];
    if (trend) {
      return trend.message;
    }

    return 'Historical trend is not available for this metric yet.';
  }

  private formatLatencyLabel(latencyMs: number): string {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      return 'Data latency unavailable';
    }

    if (latencyMs < 10) {
      return 'Data retrieved in under 10 ms';
    }

    if (latencyMs < 100) {
      return `Data retrieved in about ${Math.round(latencyMs / 10) * 10} ms`;
    }

    if (latencyMs < 1000) {
      return `Data retrieved in about ${Math.round(latencyMs / 50) * 50} ms`;
    }

    return `Data retrieved in about ${(latencyMs / 1000).toFixed(1)} s`;
  }

  private toDateKey(value: string): string {
    const [datePart] = value.split('T');
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }

    const date = this.parseDateValue(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateValue(value: string): Date {
    return new Date(value.includes('T') ? value : `${value}T00:00:00`);
  }

  private normalizeLocalDateTimeKey(value: string): string {
    return value.length >= 16 ? value.slice(0, 16) : value;
  }

  private formatLocalHourLabel(value: string, includeDay: boolean): string {
    const [datePart, timePart = ''] = value.split('T');
    const hourLabel = this.formatTimeTo12Hour(timePart);

    if (!includeDay || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return hourLabel;
    }

    const [year, month, day] = datePart.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'UTC'
    });

    return `${weekday} ${hourLabel}`;
  }

  private formatTimeTo12Hour(timePart: string): string {
    const match = timePart.match(/^(\d{2}):(\d{2})/);
    if (!match) {
      return timePart || '';
    }

    const hour = Number(match[1]);
    const minute = match[2];
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute} ${suffix}`;
  }
}
