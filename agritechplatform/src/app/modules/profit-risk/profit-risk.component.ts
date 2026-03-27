import { Component, OnDestroy, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, distinctUntilChanged, filter, takeUntil } from 'rxjs';
import { AdelaideTimePipe } from '../../shared/pipes/adelaide-time.pipe';
import { BlockService } from '../../shared/services/block.service';
import { 
  LucideAngularModule, 
  TrendingUp, 
  AlertTriangle, 
  DollarSign, 
  BarChart3, 
  ShieldCheck,
  Info, 
  HelpCircle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Droplets, 
  Lightbulb, 
  BarChart2, 
  PieChart, 
  Globe 
} from 'lucide-angular';
import { UserDataService } from '../../core/services/user-data.service';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/user.model';
import { DashboardApiService, DashboardInsightsResponse } from '../../core/services/dashboard-api.service';
import { Block } from '../../shared/models';

export interface Crop {
  name: string;
  yieldPerHa: number;
  adjustedYieldPerHa?: number;
  pricePerTon: number;
  waterMLPerHa: number;
  variableCosts: number;
  fixedCosts: number;
  volatilityFactor: number;
  color: string;
  type: 'core' | 'alternative';
  marginParams: { revenueAt100: number; costsAt100: number };
  capitalCost: number;
  yearsStr: string;
  riskLevel: 'CRITICAL' | 'MEDIUM' | 'LOW';
  badges?: { text: string; type: string }[];
  revenuePerHa?: number;
  totalCostsPerHa?: number;
  netMarginPerHa?: number;
  revenuePerML?: number;
  riskAdjustedRevenuePerML?: number;
  yearsToProfit?: number | string;
}

interface LiveWineGrapeEconomics {
  tonnesPerHaCenter: number;
  tonnesPerHaRangeLabel: string;
  totalTonnageLabel: string;
  yieldAdjustmentFactor: number;
  revenuePerHa: number;
  netMarginPerHa: number;
  revenuePerML: number;
  riskAdjustedRevenuePerML: number;
  projectedLoss: number;
  outlookLabel: string;
  guidance: string;
  yearsToProfit: number | string;
}

@Component({
  selector: 'app-profit-risk',
  standalone: true,
  imports: [CommonModule, FormsModule, AdelaideTimePipe, LucideAngularModule],
  templateUrl: './profit-risk.component.html',
  styleUrls: ['./profit-risk.component.css']
})
export class ProfitRiskComponent implements OnInit, OnDestroy {
  // Icons
  readonly TrendingUp = TrendingUp;
  readonly AlertTriangle = AlertTriangle;
  readonly DollarSign = DollarSign;
  readonly BarChart3 = BarChart3;
  readonly ShieldCheck = ShieldCheck;
  readonly Info = Info;
  readonly HelpCircle = HelpCircle;
  readonly ArrowUpRight = ArrowUpRight;
  readonly ArrowDownRight = ArrowDownRight;
  readonly Droplets = Droplets;
  readonly Lightbulb = Lightbulb;
  readonly BarChart2 = BarChart2;
  readonly PieChart = PieChart;
  readonly Globe = Globe;
  
  // Aliases for compatibility with template
  TrendingIcon = TrendingUp;
  AlertIcon = AlertTriangle;
  DollarIcon = DollarSign;
  BarChartIcon = BarChart3;
  ShieldIcon = ShieldCheck;

  user: User | undefined;
  private readonly destroy$ = new Subject<void>();
  private blockService = inject(BlockService);
  selectedBlock = toSignal(this.blockService.selectedBlock$);
  private dashboardApiService = inject(DashboardApiService);
  private authService = inject(AuthService);

  // State
  waterAllocation = signal<number>(100); // Default 100% as requested
  showBankruptcyImpact = signal<boolean>(false);
  selectedScenario = signal<'alternative' | 'global'>('alternative');
  selectedCropName = signal<string>('Wine Grapes');
  hoveredSegment = signal<string | null>(null);
  hoveredRevenueCrop = signal<string | null>(null);
  hoveredCrop = signal<any>(null); // For quadrant tooltip
  selectedQuadrantCrop = signal<any>(null); // For detail modal
  liveInsights = signal<DashboardInsightsResponse | null>(null);
  profitRiskWarning = signal<string | null>(null);

  // Constants
  readonly WATER_PRICE_PER_ML = 150; // Assumed temporary value, adjust if needed

  // Data
  crops: Crop[] = [
      {
          name: 'Wine Grapes',
          yieldPerHa: 12,
          pricePerTon: 244,
          waterMLPerHa: 6,
          variableCosts: 2500,
          fixedCosts: 1300,
          volatilityFactor: 0.35,
          color: '#EF4444',
          type: 'core',
          marginParams: { revenueAt100: 6225, costsAt100: 8000 },
          capitalCost: 0,
          yearsStr: 'Ongoing losses',
          riskLevel: 'CRITICAL',
          badges: [{ text: '2024 Crisis', type: 'crisis' }]
      },
      {
          name: 'Olives',
          yieldPerHa: 12,
          pricePerTon: 2678.5, // Adjusted to match Risk Adj Rev $5464 (6428 * 0.85)
          waterMLPerHa: 5,
          variableCosts: 12000,
          fixedCosts: 4000,
          volatilityFactor: 0.15,
          color: '#22C55E',
          type: 'alternative',
          marginParams: { revenueAt100: 45000, costsAt100: 5900 },
          capitalCost: 28500,
          yearsStr: '4-6 years',
          riskLevel: 'LOW',
          badges: [{ text: 'PIRSA', type: 'verified' }]
      },
      {
          name: 'Almonds',
          yieldPerHa: 3.5,
          pricePerTon: 10285,
          waterMLPerHa: 12,
          variableCosts: 18000,
          fixedCosts: 5000,
          volatilityFactor: 0.2,
          color: '#F59E0B',
          type: 'alternative',
          marginParams: { revenueAt100: 30000, costsAt100: 8500 },
          capitalCost: 40000,
          yearsStr: '5 years',
          riskLevel: 'MEDIUM'
      },
      {
          name: 'Citrus',
          yieldPerHa: 45,
          pricePerTon: 2000,
          waterMLPerHa: 9,
          variableCosts: 50000,
          fixedCosts: 13000,
          volatilityFactor: 0.18, // Adjusted
          color: '#3B82F6',
          type: 'alternative',
          marginParams: { revenueAt100: 80000, costsAt100: 17500 },
          capitalCost: 32500,
          yearsStr: '4 years',
          riskLevel: 'LOW'
      },
      {
          name: 'Table Grapes',
          yieldPerHa: 22,
          pricePerTon: 2500,
          waterMLPerHa: 7,
          variableCosts: 30000,
          fixedCosts: 6000,
          volatilityFactor: 0.20, // Adjusted
          color: '#A855F7',
          type: 'alternative',
          marginParams: { revenueAt100: 55000, costsAt100: 22500 },
          capitalCost: 25000,
          yearsStr: '3 years',
          riskLevel: 'LOW'
      }
  ];

  constructor(private userDataService: UserDataService) {}

  ngOnInit() {
    this.user = this.authService.getCurrentUser() || this.userDataService.getUsers()[0];

    this.blockService.block$
      .pipe(
        takeUntil(this.destroy$),
        filter(block => !!block),
        distinctUntilChanged((previous, current) => previous.lan === current.lan)
      )
      .subscribe(block => {
        this.loadLiveForecast(block);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  liveLai = computed(() => this.liveInsights()?.metrics.lai.raw ?? null);

  projectedTonnageRange = computed(() => {
    const block = this.selectedBlock();
    const lai = this.liveInsights()?.metrics.lai.raw ?? null;
    if (!block || lai === null) {
      return null;
    }

    const tonnesPerHaCenter = Math.max(1.2, Math.min(5.8, 1.15 + lai * 0.78));
    const lowerPerHa = tonnesPerHaCenter * 0.85;
    const upperPerHa = tonnesPerHaCenter * 1.15;
    const totalLower = lowerPerHa * block.size;
    const totalUpper = upperPerHa * block.size;

    return {
      centerPerHa: tonnesPerHaCenter,
      perHa: `${lowerPerHa.toFixed(1)}-${upperPerHa.toFixed(1)} t/ha`,
      totalCenter: ((lowerPerHa + upperPerHa) / 2) * block.size,
      total: `${totalLower.toFixed(1)}-${totalUpper.toFixed(1)} t`,
    };
  });

  liveWineGrapeEconomics = computed<LiveWineGrapeEconomics | null>(() => {
    const tonnage = this.projectedTonnageRange();
    const insights = this.liveInsights();
    if (!tonnage || !insights) {
      return null;
    }

    const allocation = this.waterAllocation() / 100;
    const baseCrop = this.crops.find(crop => crop.name === 'Wine Grapes');
    if (!baseCrop) {
      return null;
    }

    const tonnesPerHaCenter = tonnage.centerPerHa;
    const baselineForecastPerHa = 4.2;
    const yieldAdjustmentFactor = Math.max(0.45, Math.min(1.55, tonnesPerHaCenter / baselineForecastPerHa));
    const revenuePerHa = baseCrop.marginParams.revenueAt100 * allocation * yieldAdjustmentFactor;
    const netMarginPerHa = revenuePerHa - baseCrop.marginParams.costsAt100;
    const revenuePerML = baseCrop.waterMLPerHa > 0 ? revenuePerHa / baseCrop.waterMLPerHa : 0;
    const riskAdjustedRevenuePerML = revenuePerML * (1 - baseCrop.volatilityFactor);
    const projectedLoss = Math.max(0, (baseCrop.marginParams.revenueAt100 * allocation) - revenuePerHa);

    let outlookLabel = 'Stable';
    let guidance = 'Yield and return expectations are broadly in line with the current block plan.';
    if (tonnesPerHaCenter < 2 || projectedLoss >= 40) {
      outlookLabel = 'Downside risk';
      guidance = 'Lower canopy strength is pulling the block below its expected return, so budget and harvest planning should be tightened.';
    } else if (tonnesPerHaCenter > 5 || projectedLoss <= 10) {
      outlookLabel = 'Upside potential';
      guidance = 'This block is running ahead of the base forecast, so there is room for a stronger-than-usual return if fruit quality holds.';
    }

    const yearsToProfit = netMarginPerHa > 0 ? 1 : 'Ongoing losses';

    return {
      tonnesPerHaCenter,
      tonnesPerHaRangeLabel: tonnage.perHa,
      totalTonnageLabel: tonnage.total,
      yieldAdjustmentFactor,
      revenuePerHa,
      netMarginPerHa,
      revenuePerML,
      riskAdjustedRevenuePerML,
      projectedLoss,
      outlookLabel,
      guidance,
      yearsToProfit
    };
  });

  forecastConfidence = computed(() => {
    const insights = this.liveInsights();
    if (!insights) return 'Waiting';
    if (insights.dataQuality === 'good' && insights.source === 'real') return 'High confidence';
    if (insights.dataQuality === 'degraded' || insights.source === 'simulated') return 'Moderate confidence';
    return 'Low confidence';
  });

  liveForecastStatus = computed(() => {
    const insights = this.liveInsights();
    if (!insights) return 'Loading live forecast';
    if (insights.status === 'updating') return 'Live forecast refresh in progress';
    if (insights.status === 'stale') return 'Showing cached forecast while refresh runs';
    if (insights.dataQuality === 'degraded') return 'Forecast available with reduced image quality';
    if (insights.dataQuality === 'no_data') return 'No usable satellite data available';
    return insights.source === 'real' ? 'Forecast refreshed from satellite data' : 'Forecast loaded from cache';
  });

  freshnessSummary = computed(() => {
    const insights = this.liveInsights();
    if (!insights?.compositeDateTo) return 'Composite date unavailable';
    return `Composite date: ${this.formatInsightDate(insights.compositeDateTo)}`;
  });

  laiAdvisory = computed(() => {
    const lai = this.liveInsights()?.metrics.lai.raw ?? null;
    if (lai === null) {
      return {
        title: 'Waiting for live tonnage forecast',
        message: 'The next clear satellite composite will update the yield outlook for this block.',
        severity: 'info'
      };
    }

    if (lai > 5) {
      return {
        title: 'Above-average yield advisory',
        message: 'Leaf area is high for this block. Review canopy and quality settings so strong volume does not reduce fruit quality.',
        severity: 'positive'
      };
    }

    if (lai < 2) {
      return {
        title: 'Yield warning',
        message: 'Leaf area is below target, so harvest tonnage and profit expectations should be revised downward.',
        severity: 'critical'
      };
    }

    return {
      title: 'Forecast tracking normally',
      message: 'Leaf area is in the workable production range. Continue monitoring every new satellite refresh.',
      severity: 'neutral'
    };
  });

  profitForecastSummary = computed(() => {
    const insights = this.liveInsights();
    const wineEconomics = this.liveWineGrapeEconomics();
    if (!insights || !wineEconomics) {
      return 'Profit impact unavailable while the live forecast loads.';
    }

    if (wineEconomics.netMarginPerHa < 0) {
      return `Current block forecast implies about ${this.formatCompactCurrency(Math.abs(wineEconomics.netMarginPerHa))}/ha downside versus break-even.`;
    }

    if (wineEconomics.projectedLoss > 0) {
      return `Projected profit risk: ${this.formatCompactCurrency(wineEconomics.projectedLoss)} under current block conditions.`;
    }

    return 'No immediate profit loss is implied by the current block forecast.';
  });

  profitOutlookHeadline = computed(() => {
    const wineEconomics = this.liveWineGrapeEconomics();
    if (!wineEconomics) {
      return '--';
    }
    return wineEconomics.outlookLabel;
  });

  keyInsight = computed(() => {
    const wineEconomics = this.liveWineGrapeEconomics();
    if (!wineEconomics) {
      return {
        title: 'Key Insight',
        message: 'Waiting for the latest satellite forecast before updating the block-level profit picture.',
        warning: 'This section refreshes when a new LAI composite is available.'
      };
    }

    const marginText = wineEconomics.netMarginPerHa >= 0
      ? `+$${Math.round(wineEconomics.netMarginPerHa).toLocaleString()}/ha margin estimate`
      : `-$${Math.round(Math.abs(wineEconomics.netMarginPerHa)).toLocaleString()}/ha margin pressure`;

    return {
      title: 'Live block impact',
      message: `Wine grapes are currently tracking at ${wineEconomics.tonnesPerHaRangeLabel} with ${marginText}.`,
      warning: `${this.forecastConfidence()} at ${this.waterAllocation()}% water allocation. ${wineEconomics.guidance}`
    };
  });

  // Computed Values
  cropMetrics = computed(() => {
      const allocation = this.waterAllocation() / 100;
      const wineEconomics = this.liveWineGrapeEconomics();

      return this.crops.map(crop => {
          const effectiveWaterProportion = allocation;
          const adjustedYield = crop.yieldPerHa * effectiveWaterProportion;
          const revenuePerHaStandard = adjustedYield * crop.pricePerTon;
          let revenuePerML = crop.waterMLPerHa > 0 ? revenuePerHaStandard / crop.waterMLPerHa : 0;
          let riskAdjustedRevenuePerML = revenuePerML * (1 - crop.volatilityFactor);

          // Logic for Net Margin Chart (Specific Targets)
          // Revenue scales with allocation, Costs stay fixed
          let marginRevenue = (crop.marginParams?.revenueAt100 || 0) * allocation;
          const marginCosts = crop.marginParams?.costsAt100 || 0;
          let netMarginPerHa = marginRevenue - marginCosts;

          let yearsToProfit: number | string = netMarginPerHa > 0 ? Math.ceil(30000 / netMarginPerHa) : 'Ongoing losses';
          let yearsStr = crop.yearsStr;

          if (crop.name === 'Wine Grapes' && wineEconomics) {
              marginRevenue = wineEconomics.revenuePerHa;
              netMarginPerHa = wineEconomics.netMarginPerHa;
              revenuePerML = wineEconomics.revenuePerML;
              riskAdjustedRevenuePerML = wineEconomics.riskAdjustedRevenuePerML;
              yearsToProfit = wineEconomics.yearsToProfit;
              yearsStr = typeof yearsToProfit === 'number' ? `${yearsToProfit} year` : 'Ongoing losses';
          }


          return {
              ...crop,
              yieldPerHa: crop.name === 'Wine Grapes' && wineEconomics ? wineEconomics.tonnesPerHaCenter : crop.yieldPerHa,
              yearsStr,
              adjustedYieldPerHa: crop.name === 'Wine Grapes' && wineEconomics ? wineEconomics.tonnesPerHaCenter * effectiveWaterProportion : adjustedYield,
              revenuePerHa: marginRevenue, // Use margin revenue for tooltip
              totalCostsPerHa: marginCosts, // Use margin costs for tooltip
              netMarginPerHa,
              revenuePerML,
              riskAdjustedRevenuePerML,
              yearsToProfit
          };
      });
  });

  riskAdjustedMetrics = computed(() => {
      return this.cropMetrics().filter(c => c.type === 'alternative').sort((a, b) => a.riskAdjustedRevenuePerML - b.riskAdjustedRevenuePerML);
  });

  // Fixed order for Revenue per ML chart (never sorted by value)
  cropMetricsFixedOrder = computed(() => {
      const metrics = this.cropMetrics();
      const order = ['Wine Grapes', 'Almonds', 'Olives', 'Table Grapes', 'Citrus'];
      return order.map(name => metrics.find(c => c.name === name)).filter((c): c is NonNullable<typeof c> => c !== undefined);
  });

  // Selected Crop Metrics for Cost Structure
  selectedCropMetrics = computed(() => {
      const crop = this.cropMetrics().find(c => c.name === this.selectedCropName());
      if (!crop) return null;

      const revenue = crop.revenuePerHa;
      const costs = crop.totalCostsPerHa;
      const margin = crop.netMarginPerHa;
      const capital = crop.capitalCost || 0;
      const isCritical = crop.riskLevel === 'CRITICAL';

      let chartData: any = {};

      if (isCritical) {
          // CRITICAL: 2-segment chart (Revenue vs Costs)
          const totalPie = revenue + costs;
          chartData = {
              costPercentage: totalPie > 0 ? (costs / totalPie) * 100 : 0,
              revenuePercentage: totalPie > 0 ? (revenue / totalPie) * 100 : 0
          };
      } else {
          // NON-CRITICAL: 3-segment chart (Input + Capital + Margin)
          const safeMargin = Math.max(0, margin);
          const totalPie = costs + capital + safeMargin;
          chartData = {
              inputPct: totalPie > 0 ? (costs / totalPie) * 100 : 0,
              capitalPct: totalPie > 0 ? (capital / totalPie) * 100 : 0,
              marginPct: totalPie > 0 ? (safeMargin / totalPie) * 100 : 0
          };
      }

      return {
          name: crop.name,
          revenue,
          costs,
          margin,
          capital,
          color: crop.color,
          isCritical,
          ...chartData
      };
  });

  selectCrop(name: string) {
      this.selectedCropName.set(name);
  }

  readonly WINE_GRAPE_BASELINE = 493.44512195121956;

  wineGrapeRiskAdjustedBaseline = computed(() => {
      const wineGrapes = this.cropMetrics().find(c => c.name === 'Wine Grapes');
      return wineGrapes?.riskAdjustedRevenuePerML ?? this.WINE_GRAPE_BASELINE;
  });

  wineGrapeMetrics = computed(() => {
      return this.cropMetrics().find(c => c.name === 'Wine Grapes');
  });

  protected readonly Math = Math;

  // Tooltip Helper
  getHoveredPercentage(metrics: any): number {
      if (metrics.isCritical) {
          if (this.hoveredSegment() === 'costs') return metrics.costPercentage;
          if (this.hoveredSegment() === 'revenue') return metrics.revenuePercentage;
      } else {
          if (this.hoveredSegment() === 'input') return metrics.inputPct;
          if (this.hoveredSegment() === 'capital') return metrics.capitalPct;
          if (this.hoveredSegment() === 'margin') return metrics.marginPct;
      }
      return 0;
  }

  getHoveredValue(metrics: any): number {
      if (metrics.isCritical) {
          if (this.hoveredSegment() === 'costs') return metrics.costs;
          if (this.hoveredSegment() === 'revenue') return metrics.revenue;
      } else {
          if (this.hoveredSegment() === 'input') return metrics.costs;
          if (this.hoveredSegment() === 'capital') return metrics.capital;
          if (this.hoveredSegment() === 'margin') return metrics.margin;
      }
      return 0;
  }

  getHoveredLabel(): string {
      if (this.hoveredSegment() === 'costs' || this.hoveredSegment() === 'input') return 'Input Costs';
      if (this.hoveredSegment() === 'revenue') return 'Revenue';
      if (this.hoveredSegment() === 'capital') return 'Capital Investment';
      if (this.hoveredSegment() === 'margin') return 'Net Margin';
      return '';
  }

  // Chart Scaling
  readonly MARGIN_MAX = 80000;
  readonly MARGIN_MIN = -10000;
  readonly MARGIN_RANGE = this.MARGIN_MAX - this.MARGIN_MIN;

  getBarHeightPercentage(value: number): number {
      return (Math.abs(value) / this.MARGIN_RANGE) * 100;
  }

  getZeroLinePosition(): number {
      return (Math.abs(this.MARGIN_MIN) / this.MARGIN_RANGE) * 100;
  }

  isPositive(value: number): boolean {
      return value >= 0;
  }

  // Methods
  getSliderBackground(): string {
      const val = this.waterAllocation();
      const min = 50;
      const max = 100;
      // Calculate percentage of the range (0% at min, 100% at max)
      const percentage = ((val - min) / (max - min)) * 100;

      return `linear-gradient(to right, var(--primary-green) 0%, var(--primary-green) ${percentage}%, var(--gray-200) ${percentage}%, var(--gray-200) 100%)`;
  }

  // Methods
  onAllocationChange(event: Event) {
      const value = (event.target as HTMLInputElement).value;
      this.waterAllocation.set(Number(value));
  }

  // Get bankruptcy-adjusted revenue for tooltip display (only for Wine Grapes)
  getBankruptcyAdjustedRevenue(cropName: string): number {
      const crop = this.cropMetrics().find(c => c.name === cropName);
      if (!crop) return 0;

      if (!this.showBankruptcyImpact()) {
          return crop.revenuePerML;
      }

      // Apply bankruptcy impact ONLY to Wine Grapes (CRITICAL)
      if (crop.riskLevel === 'CRITICAL') {
          return crop.revenuePerML * 0.65; // 35% reduction for crisis crop
      } else {
          return crop.revenuePerML; // No change for other crops
      }
  }

  // Get the revenue value to display on the bar (affected by bankruptcy toggle for Wine Grapes only)
  getDisplayRevenue(crop: any): number {
      if (this.showBankruptcyImpact() && crop.riskLevel === 'CRITICAL') {
          return this.getBankruptcyAdjustedRevenue(crop.name);
      }
      return crop.revenuePerML;
  }

  // Get percentage difference vs Wine Grapes
  getPercentageVsWineGrapes(cropName: string): number {
      const wineGrapes = this.cropMetrics().find(c => c.name === 'Wine Grapes');
      const crop = this.cropMetrics().find(c => c.name === cropName);
      if (!wineGrapes || !crop) return 0;

      const wineGrapesRevenue = this.getDisplayRevenue(wineGrapes);
      const cropRevenue = crop.revenuePerML;

      if (wineGrapesRevenue === 0) return 0;
      return ((cropRevenue - wineGrapesRevenue) / wineGrapesRevenue) * 100;
  }

  getRiskAdjustedDifferenceVsWineGrapes(crop: Crop): number {
      const baseline = this.wineGrapeRiskAdjustedBaseline();
      const riskAdjustedRevenue = crop.riskAdjustedRevenuePerML ?? 0;
      if (!baseline || this.waterAllocation() === 0) {
          return 0;
      }

      return (((riskAdjustedRevenue / (this.waterAllocation() / 100)) - baseline) / baseline) * 100;
  }

  private loadLiveForecast(block: Block): void {
      this.profitRiskWarning.set(null);
      this.dashboardApiService.getBlockInsights(block.lan || block.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
          next: insights => {
              this.liveInsights.set(insights);
              this.profitRiskWarning.set(insights.warning);
          },
          error: error => {
              console.error('Profit & Risk forecast failed to load.', error);
              this.liveInsights.set(null);
              this.profitRiskWarning.set('Unable to load the live satellite forecast for this block.');
          }
      });
  }

  private formatInsightDate(value: string): string {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
          return value;
      }

      return date.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
      });
  }

  private formatCompactCurrency(value: number): string {
      const absValue = Math.abs(value);
      if (absValue >= 1000000) {
          return `$${(absValue / 1000000).toFixed(1)}M`;
      }
      if (absValue >= 1000) {
          return `$${(absValue / 1000).toFixed(1)}k`;
      }
      return `$${Math.round(absValue)}`;
  }

    // Quadrant positioning for Global Market Quadrant view
    readonly quadrantCrops = (() => {
        const wineGrapesRevenue = 759;
        return [
            {
                name: 'Almonds',
                icon: '🌰',
                color: '#F59E0B',
                quadrantX: 18,
                quadrantY: 22,
                bubbleSize: 90,
                zIndex: 2,
                revenuePerML: 3000,
                percentageVsWine: Math.round(((3000 - wineGrapesRevenue) / wineGrapesRevenue) * 100),
                quadrant: 'Quadrant 1 - OPPORTUNITY',
                badges: [],
                metrics: [
                    'Australia\'s #1 irrigated crop [ABC Feb 2024]',
                    'Stable kernel demand despite water debate',
                    '3 t/ha yield at $10,000/t market price'
                ],
                strategicAction: 'EXPAND PRODUCTION',
                source: 'Hort Innovation Almonds 2024'
            },
            {
                name: 'Citrus (Navel)',
                icon: '🍊',
                color: '#3B82F6',
                quadrantX: 35,
                quadrantY: 20,
                bubbleSize: 90,
                zIndex: 2,
                revenuePerML: 10000,
                percentageVsWine: Math.round(((10000 - wineGrapesRevenue) / wineGrapesRevenue) * 100),
                quadrant: 'Quadrant 1 - OPPORTUNITY',
                badges: [],
                metrics: [
                    'Navel oranges stable export demand',
                    'Reliable premium market despite China issues',
                    '40 t/ha yield at $2,000/t market price'
                ],
                strategicAction: 'MAINTAIN / EXPAND',
                source: 'Citrus Australia 2024'
            },
            {
                name: 'Olives',
                icon: '🫒',
                color: '#16A34A',
                quadrantX: 28,
                quadrantY: 38,
                bubbleSize: 90,
                zIndex: 3,
                revenuePerML: 6429,
                percentageVsWine: Math.round(((6429 - wineGrapesRevenue) / wineGrapesRevenue) * 100),
                quadrant: 'Quadrant 1 - OPPORTUNITY',
                badges: ['✓ PIRSA 2025 VALIDATED'],
                metrics: [
                    'Water: 5-9.5 ML/ha (30% LESS than wine grapes) [PIRSA 2025]',
                    'High-density setup: $28,500/ha uses existing drip irrigation',
                    'Yield: 12-18 t/ha @ $950/t fresh ($3k/t oil equivalent)',
                    'Operating costs: $5,900/ha (30-40% LESS labor than grapes)',
                    'Net profit: +$76k-$121k/ha mature (yr 7+) [PIRSA Financial Model]',
                    '70% of vineyard rows ideal for conversion; 3.6-5m spacing preferred'
                ],
                strategicAction: 'CONVERT 10-20% VINEYARDS - PIRSA PRIORITY PROGRAM',
                source: 'PIRSA/CCW Factsheet 2025',
                hasFactsheet: true
            },
            {
                name: 'Table Grapes',
                icon: '🍇',
                color: '#A855F7',
                quadrantX: 22,
                quadrantY: 35,
                bubbleSize: 90,
                zIndex: 2,
                revenuePerML: 7857,
                percentageVsWine: Math.round(((7857 - wineGrapesRevenue) / wineGrapesRevenue) * 100),
                quadrant: 'Quadrant 1 - OPPORTUNITY',
                badges: [],
                metrics: [
                    'Premium fresh market vs bulk wine glut',
                    'Sunmuscat export demand stable',
                    '22 t/ha yield at $2,500/t market price'
                ],
                strategicAction: 'UPGRADE TO PREMIUM VARIETIES',
                source: 'Australian Table Grapes 2024'
            },
            {
                name: 'Wine Grapes',
                icon: '🍷',
                color: '#EF4444',
                quadrantX: 75,
                quadrantY: 22,
                bubbleSize: 90,
                zIndex: 1,
                revenuePerML: 759,
                percentageVsWine: 0,
                quadrant: 'Quadrant 2 - REDUCE/EXIT',
                badges: [],
                metrics: [
                    '391kt oversupply (WGCSA 2024)',
                    'Shiraz $200/t (below break-even)',
                    'Weak export demand + strong supply'
                ],
                strategicAction: 'REDUCE / EXIT',
                source: 'WGCSA 2024'
            }
        ];
    })();

}
