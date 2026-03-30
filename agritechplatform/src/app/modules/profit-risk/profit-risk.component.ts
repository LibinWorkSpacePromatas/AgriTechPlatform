import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import {
  BarController,
  BarElement,
  BubbleController,
  CategoryScale,
  Chart,
  ChartConfiguration,
  ChartData,
  Legend,
  LinearScale,
  Plugin,
  PointElement,
  ScriptableScaleContext,
  Tooltip
} from 'chart.js';
import { distinctUntilChanged, filter } from 'rxjs';
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  Droplets,
  Info,
  LucideAngularModule,
  ShieldCheck,
  Sprout,
  TrendingUp
} from 'lucide-angular';

import { environment } from '../../../environments/environment';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import { AdelaideTimePipe } from '../../shared/pipes/adelaide-time.pipe';

Chart.register(BarController, BubbleController, BarElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

interface ProfitRiskScenarioMargins {
  low: number;
  current: number;
  high: number;
  selected: number;
}

interface ProfitRiskCropRow {
  crop: string;
  commodity: string;
  current_price: number;
  break_even_price: number;
  price_trend: string;
  yield_t_ha: number;
  water_req_ml_ha: number;
  cost_per_unit: number;
  margins: ProfitRiskScenarioMargins;
}

interface ProfitRiskCurrentCrop {
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

interface ProfitRiskResponse {
  block_id: string;
  block_name: string;
  block_crop: string;
  water_price: number;
  net_margin: number;
  risk_level: string;
  best_crop: string;
  best_crop_margin: number;
  updated_at: string;
  current_crop: ProfitRiskCurrentCrop;
  margins: ProfitRiskCropRow[];
}

@Component({
  selector: 'app-profit-risk',
  standalone: true,
  imports: [CommonModule, FormsModule, AdelaideTimePipe, LucideAngularModule, BaseChartDirective],
  templateUrl: './profit-risk.component.html',
  styleUrls: ['./profit-risk.component.css']
})
export class ProfitRiskComponent implements OnInit {
  readonly TrendingUp = TrendingUp;
  readonly AlertTriangle = AlertTriangle;
  readonly DollarSign = DollarSign;
  readonly BarChart3 = BarChart3;
  readonly ShieldCheck = ShieldCheck;
  readonly Droplets = Droplets;
  readonly CropIcon = Sprout;
  readonly InfoIcon = Info;

  private readonly http = inject(HttpClient);
  private readonly blockService = inject(BlockService);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedBlock = toSignal(this.blockService.selectedBlock$);
  readonly waterPrice = signal<number>(153);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly profitData = signal<ProfitRiskResponse | null>(null);
  readonly scenarioOptions = [80, 153, 420];

  readonly currentCrop = computed(() => this.profitData()?.current_crop ?? null);
  readonly heroBlockLabel = computed(() => {
    const name = this.selectedBlock()?.name?.trim();
    if (!name) {
      return 'Selected Block';
    }

    return name.split(' - ')[0]?.trim() || name;
  });
  readonly heroCropLabel = computed(() => {
    const matchedCrop = this.currentCrop()?.matched_crop;
    if (matchedCrop) {
      return this.getChartLabel(matchedCrop);
    }

    const blockCrop = this.selectedBlock()?.crop;
    return blockCrop ? this.getChartLabel(blockCrop) : 'Crop';
  });
  readonly marginRows = computed(() => this.profitData()?.margins ?? []);
  readonly chartRows = computed(() => {
    const desiredOrder = [
      'Shiraz (inland red — Riverland)',
      'Chardonnay (inland white — Riverland)',
      'Table Grapes — all varieties (Riverland/SA)',
      'Almond kernel (shelled — grower pool price)',
      'Olive oil — extra virgin bulk (oil-to-mill)',
      'Navel Oranges (fresh market)',
      'Peaches (fresh market — Riverland SA)'
    ];

    const rowsByCrop = new Map(this.marginRows().map(row => [row.crop, row]));
    return desiredOrder
      .map(crop => rowsByCrop.get(crop))
      .filter((row): row is ProfitRiskCropRow => !!row);
  });
  readonly marginChartData = computed<ChartData<'bar'>>(() => ({
    labels: this.chartRows().map(row => this.getChartLabel(row.crop)),
    datasets: [
      {
        label: 'Low water $80/ML',
        data: this.chartRows().map(row => row.margins.low),
        backgroundColor: '#6abf69',
        borderWidth: 0
      },
      {
        label: `Selected $${Math.round(this.waterPrice())}/ML`,
        data: this.chartRows().map(row => row.margins.selected),
        backgroundColor: '#ffa126',
        borderWidth: 0
      },
      {
        label: 'High $420/ML',
        data: this.chartRows().map(row => row.margins.high),
        backgroundColor: '#fb5d52',
        borderWidth: 0
      }
    ]
  }));
  readonly marginChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          boxWidth: 18,
          boxHeight: 8,
          color: '#374151',
          font: { size: 11 }
        }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${this.formatCurrency(Number(context.raw))}/ha`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#4b5563',
          font: { size: 11 }
        },
        border: { color: '#aeb6c2' }
      },
      y: {
        min: -10000,
        max: 12500,
        ticks: {
          stepSize: 2500,
          color: '#4b5563',
          callback: (value: string | number) => this.formatCurrency(Number(value))
        },
        title: {
          display: true,
          text: 'Net margin (AUD / hectare)',
          color: '#4b5563',
          font: { size: 12 }
        },
        grid: {
          color: (context: ScriptableScaleContext) => Number(context.tick.value) === 0 ? '#374151' : '#e5e7eb',
          lineWidth: (context: ScriptableScaleContext) => Number(context.tick.value) === 0 ? 1.4 : 1
        },
        border: { color: '#aeb6c2' }
      }
    }
  };
  readonly priceChartRows = computed(() => {
    const desiredOrder = [
      'Almond kernel (shelled — grower pool price)',
      'Navel Oranges (fresh market)',
      'Table Grapes — all varieties (Riverland/SA)',
      'Nectarines (fresh market — Riverland SA)',
      'Peaches (fresh market — Riverland SA)',
      'Chardonnay (inland white — Riverland)',
      'Colombard (inland white — Riverland)',
      'Cabernet Sauvignon (inland red — Riverland)',
      'Shiraz (inland red — Riverland)'
    ];

    const rowsByCrop = new Map(this.marginRows().map(row => [row.crop, row]));
    return desiredOrder
      .map(crop => rowsByCrop.get(crop))
      .filter((row): row is ProfitRiskCropRow => !!row);
  });
  readonly priceChartData = computed<ChartData<'bar'>>(() => ({
    labels: this.priceChartRows().map(row => this.getChartLabel(row.crop)),
    datasets: [
      {
        label: 'Current farmgate price (mid)',
        data: this.priceChartRows().map(row => row.current_price),
        backgroundColor: this.priceChartRows().map(row => this.getPriceBarColor(row.crop)),
        borderWidth: 0,
        barThickness: 12,
        categoryPercentage: 0.72,
        barPercentage: 0.9
      },
      {
        label: 'Break-even price needed',
        data: this.priceChartRows().map(row => row.break_even_price),
        backgroundColor: '#b9c7d1',
        borderWidth: 0,
        barThickness: 12,
        categoryPercentage: 0.72,
        barPercentage: 0.9
      }
    ]
  }));
  readonly priceStatusPlugin: Plugin<'bar'> = {
    id: 'priceStatusLabels',
    afterDatasetsDraw: (chart: any) => {
      const rows = this.priceChartRows();
      const currentMeta = chart.getDatasetMeta(0);
      const breakEvenMeta = chart.getDatasetMeta(1);
      const ctx = chart.ctx;

      ctx.save();
      ctx.font = '700 12px Arial';
      ctx.textBaseline = 'middle';

      rows.forEach((row, index) => {
        const currentElement = currentMeta.data[index];
        const breakEvenElement = breakEvenMeta.data[index];
        if (!currentElement || !breakEvenElement) {
          return;
        }

        const status = this.getPriceChartStatus(row);
        const x = Math.max(currentElement.x, breakEvenElement.x) + 6;
        const y = (Number(currentElement.y) + Number(breakEvenElement.y)) / 2;

        ctx.fillStyle = status === 'PROFIT' ? '#1f8a3a' : '#c81e1e';
        ctx.fillText(status, x, y);
      });

      ctx.restore();
    }
  };
  readonly priceChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    indexAxis: 'y',
    layout: {
      padding: { right: 48 }
    },
    plugins: {
      legend: {
        position: 'bottom',
        align: 'end',
        labels: {
          boxWidth: 18,
          boxHeight: 8,
          color: '#374151',
          font: { size: 11 }
        }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${this.formatCurrency(Number(context.raw))}`
        }
      }
    },
    scales: {
      x: {
        min: 0,
        max: 8000,
        ticks: {
          stepSize: 1000,
          color: '#111827',
          callback: (value: string | number) => this.formatCurrency(Number(value))
        },
        title: {
          display: true,
          text: 'AUD per tonne (farmgate)',
          color: '#4b5563',
          font: { size: 12 }
        },
        grid: { color: '#e6e9ef' },
        border: { color: '#c7cfd8' }
      },
      y: {
        ticks: {
          color: '#3f3f46',
          font: { size: 11 }
        },
        grid: { display: false },
        border: { color: '#c7cfd8' }
      }
    }
  };
  readonly revenueWaterChartData = computed<ChartData<'bubble'>>(() => ({
    datasets: [
      {
        label: 'Revenue per ML',
        data: this.chartRows().map(row => ({
          x: row.water_req_ml_ha,
          y: row.current_price * row.yield_t_ha,
          r: Math.max(8, Math.min(18, Math.abs(row.margins.selected) / 900))
        })),
        backgroundColor: this.chartRows().map(row => this.getPriceBarColor(row.crop)),
        borderColor: '#ffffff',
        borderWidth: 1.5
      }
    ]
  }));
  readonly revenueWaterChartOptions: ChartConfiguration<'bubble'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: (items: any[]) => {
            const index = items?.[0]?.dataIndex ?? 0;
            const row = this.chartRows()[index];
            return row ? this.getChartLabel(row.crop) : 'Crop';
          },
          label: (context: any) => {
            const point = context.raw as { x: number; y: number; r: number };
            return [
              `Water use: ${point.x.toFixed(1)} ML/ha`,
              `Revenue: ${this.formatCurrency(point.y)}/ha`
            ];
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Water requirement (ML / ha)',
          color: '#4b5563',
          font: { size: 12 }
        },
        ticks: {
          color: '#111827'
        },
        grid: { color: '#e6e9ef' },
        border: { color: '#c7cfd8' }
      },
      y: {
        title: {
          display: true,
          text: 'Revenue (AUD / ha)',
          color: '#4b5563',
          font: { size: 12 }
        },
        ticks: {
          color: '#111827',
          callback: (value: string | number) => this.formatCompactCurrency(Number(value))
        },
        grid: { color: '#e6e9ef' },
        border: { color: '#c7cfd8' }
      }
    }
  };
  readonly revenueWaterGuidePlugin: Plugin<'bubble'> = {
    id: 'revenueWaterGuide',
    afterDraw: (chart: any) => {
      const { ctx, chartArea } = chart;
      if (!chartArea) {
        return;
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(107, 114, 128, 0.35)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, chartArea.top + 28);
      ctx.lineTo(chartArea.right, chartArea.top + 28);
      ctx.stroke();
      ctx.restore();
    }
  };
  readonly topSummary = computed(() => {
    const data = this.profitData();
    const current = this.currentCrop();
    if (!data || !current) {
      return 'Load a block to calculate live net margins from the workbook dataset.';
    }

    const profitabilityText = data.net_margin >= 0
      ? `${this.formatCurrency(data.net_margin)}/ha above zero`
      : `${this.formatCurrency(Math.abs(data.net_margin))}/ha below zero`;

    return `${this.getChartLabel(current.matched_crop)} is currently running ${profitabilityText} at ${this.formatCurrency(data.water_price)}/ML water cost.`;
  });

  ngOnInit(): void {
    this.blockService.block$
      .pipe(
        filter((block): block is Block => !!block),
        distinctUntilChanged((previous, current) => previous.lan === current.lan),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(block => {
        this.loadProfitRisk(block);
      });
  }

  applyScenario(price: number): void {
    this.waterPrice.set(price);
    this.reloadCurrentBlock();
  }

  onWaterPriceInput(event: Event): void {
    const nextValue = Number((event.target as HTMLInputElement).value);
    this.waterPrice.set(nextValue);
  }

  onWaterPriceCommit(): void {
    this.reloadCurrentBlock();
  }

  formatCurrency(value: number): string {
    const rounded = Math.round(value);
    const abs = Math.abs(rounded);
    return `${rounded < 0 ? '-' : ''}$${abs.toLocaleString()}`;
  }

  formatCompactCurrency(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(1)}M`;
    }
    if (abs >= 1_000) {
      return `${value < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}k`;
    }
    return this.formatCurrency(value);
  }

  getChartLabel(crop: string): string {
    const labels: Record<string, string> = {
      'Shiraz (inland red — Riverland)': 'Shiraz',
      'Cabernet Sauvignon (inland red — Riverland)': 'Cabernet',
      'Chardonnay (inland white — Riverland)': 'Chardonnay',
      'Colombard (inland white — Riverland)': 'Colombard',
      'Navel Oranges (fresh market)': 'Citrus Oranges',
      'Mandarins (Imperial/Murcott — fresh market)': 'Mandarins',
      'Lemons': 'Lemons',
      'Table Grapes — all varieties (Riverland/SA)': 'Table Grapes',
      'Almond kernel (shelled — grower pool price)': 'Almonds',
      'Olive oil — extra virgin bulk (oil-to-mill)': 'Olives EVOO',
      'Fresh table olives (fruit sold to processor)': 'Table Olives',
      'Peaches (fresh market — Riverland SA)': 'Peaches',
      'Nectarines (fresh market — Riverland SA)': 'Nectarines',
      'Apricots (fresh market and processing)': 'Apricots',
      'Plums (fresh market)': 'Plums',
      'Cherries (export-grade premium)': 'Cherries'
    };

    return labels[crop] ?? crop;
  }

  getPriceChartStatus(row: ProfitRiskCropRow): 'PROFIT' | 'LOSS' {
    return row.current_price >= row.break_even_price ? 'PROFIT' : 'LOSS';
  }

  getPriceBarColor(crop: string): string {
    const colors: Record<string, string> = {
      'Almonds': '#d59ae8',
      'Citrus Oranges': '#8fd0f5',
      'Table Grapes': '#98e8ee',
      'Nectarines': '#ffa08d',
      'Peaches': '#ff8b69',
      'Chardonnay': '#ccebc7',
      'Colombard': '#ffd48a',
      'Cabernet': '#f19ca3',
      'Shiraz': '#ff6e66'
    };

    return colors[this.getChartLabel(crop)] ?? '#ff7a6b';
  }

  currentCropPriceGapTone(): 'positive' | 'negative' | 'neutral' {
    const current = this.currentCrop();
    if (!current) {
      return 'neutral';
    }
    const gap = current.current_price - current.break_even_price;
    if (gap > 0) {
      return 'positive';
    }
    if (gap < 0) {
      return 'negative';
    }
    return 'neutral';
  }

  currentCropPriceGapLabel(): string {
    const current = this.currentCrop();
    if (!current) {
      return 'Unavailable';
    }
    const gap = current.current_price - current.break_even_price;
    const magnitude = this.formatCurrency(Math.abs(gap));
    if (gap > 0) {
      return `${magnitude}/t above break-even`;
    }
    if (gap < 0) {
      return `${magnitude}/t below break-even`;
    }
    return 'At break-even';
  }

  getPriceTrendTone(trend: string | null | undefined): 'critical' | 'warning' | 'positive' {
    const normalized = (trend || '').toLowerCase();
    if (normalized.includes('fall') || normalized.includes('down') || normalized.includes('weak')) {
      return 'critical';
    }
    if (normalized.includes('volatile') || normalized.includes('mixed') || normalized.includes('flat') || normalized.includes('steady')) {
      return 'warning';
    }
    return 'positive';
  }

  getMarketTrendDisplay(trend: string | null | undefined): string {
    const normalized = (trend || '').trim();
    if (!normalized) {
      return 'No trend available';
    }
    return normalized
      .split(/[_-]/g)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  getWaterNeedTone(value: number | null | undefined): 'high' | 'moderate' | 'low' {
    const waterNeed = Number(value ?? 0);
    if (waterNeed >= 8) {
      return 'high';
    }
    if (waterNeed >= 4) {
      return 'moderate';
    }
    return 'low';
  }

  getReferenceTooltipLines(key: 'price-gap' | 'trend' | 'water' | 'yield'): string[] {
    const tips: Record<'price-gap' | 'trend' | 'water' | 'yield', string[]> = {
      'price-gap': [
        'Shows how far the current farmgate price sits above or below the break-even price.',
        'Positive means the crop is currently priced above its cost-recovery point.'
      ],
      'trend': [
        'Summarises the current market direction from the backend workbook dataset.',
        'Use it as context, not a guarantee of future sale price.'
      ],
      'water': [
        'Higher ML/ha means the crop is more water intensive.',
        'In high water-price seasons, water-heavy crops lose margin faster.'
      ],
      'yield': [
        'This is the benchmark yield used by the current crop economics model.',
        'Actual farm yield can move margins materially above or below this result.'
      ]
    };

    return tips[key];
  }

  private reloadCurrentBlock(): void {
    const block = this.selectedBlock();
    if (block) {
      this.loadProfitRisk(block);
    }
  }

  private loadProfitRisk(block: Block): void {
    this.loading.set(true);
    this.error.set(null);

    const waterPrice = this.waterPrice();
    const url = `${environment.apiBaseUrl}/api/blocks/${block.lan || block.id}/profit-risk?water_price=${waterPrice}`;

    this.http.get<ProfitRiskResponse>(url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.profitData.set(data);
          this.loading.set(false);
        },
        error: error => {
          console.error('Failed to load profit & risk data.', error);
          this.error.set('Unable to load profit & risk data for the selected block.');
          this.profitData.set(null);
          this.loading.set(false);
        }
      });
  }
}  
