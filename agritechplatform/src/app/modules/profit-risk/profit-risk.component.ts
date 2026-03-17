import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { User } from '../../core/models/user.model';

export interface Crop {
  name: string;
  yieldPerHa: number;
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

@Component({
  selector: 'app-profit-risk',
  standalone: true,
  imports: [CommonModule, FormsModule, AdelaideTimePipe, LucideAngularModule],
  templateUrl: './profit-risk.component.html',
  styleUrls: ['./profit-risk.component.css']
})
export class ProfitRiskComponent implements OnInit {
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
  private blockService = inject(BlockService);
  selectedBlock = toSignal(this.blockService.selectedBlock$);

  // State
  waterAllocation = signal<number>(100); // Default 100% as requested
  showBankruptcyImpact = signal<boolean>(false);
  selectedScenario = signal<'alternative' | 'global'>('alternative');
  selectedCropName = signal<string>('Wine Grapes');
  hoveredSegment = signal<string | null>(null);
  hoveredRevenueCrop = signal<string | null>(null);
  hoveredCrop = signal<any>(null); // For quadrant tooltip
  selectedQuadrantCrop = signal<any>(null); // For detail modal

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
    this.user = this.userDataService.getUserById('U001');
  }

  // Computed Values
  cropMetrics = computed(() => {
      const allocation = this.waterAllocation() / 100;

      return this.crops.map(crop => {
          // Logic for Revenue Chart (Standard)
          const effectiveWaterProportion = allocation;
          const adjustedYield = crop.yieldPerHa * effectiveWaterProportion;
          const revenuePerHaStandard = adjustedYield * crop.pricePerTon;
          const revenuePerML = crop.waterMLPerHa > 0 ? revenuePerHaStandard / crop.waterMLPerHa : 0;
          const riskAdjustedRevenuePerML = revenuePerML * (1 - crop.volatilityFactor);

          // Logic for Net Margin Chart (Specific Targets)
          // Revenue scales with allocation, Costs stay fixed
          const marginRevenue = (crop.marginParams?.revenueAt100 || 0) * allocation;
          const marginCosts = crop.marginParams?.costsAt100 || 0;
          const netMarginPerHa = marginRevenue - marginCosts;

          const yearsToProfit = netMarginPerHa > 0 ? Math.ceil(30000 / netMarginPerHa) : 'Ongoing losses';

          return {
              ...crop,
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
