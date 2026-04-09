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
  private static readonly MIN_VIABLE_REVENUE_PER_ML = 700;

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
  readonly displayCropLabel = computed(() => {
    const selectedBlockCrop = this.selectedBlock()?.crop?.trim();
    if (selectedBlockCrop) {
      return this.getChartLabel(selectedBlockCrop);
    }

    const blockCrop = this.profitData()?.block_crop?.trim();
    if (blockCrop) {
      return this.getChartLabel(blockCrop);
    }

    const requestedCrop = this.currentCrop()?.requested_crop?.trim();
    if (requestedCrop) {
      return this.getChartLabel(requestedCrop);
    }

    const matchedCrop = this.currentCrop()?.matched_crop?.trim();
    if (matchedCrop) {
      return this.getChartLabel(matchedCrop);
    }

    return 'Crop';
  });
  readonly heroBlockLabel = computed(() => {
    const name = this.selectedBlock()?.name?.trim();
    if (!name) {
      return 'Selected Block';
    }

    return name.split(' - ')[0]?.trim() || name;
  });
  readonly heroCropLabel = computed(() => {
    return this.displayCropLabel();
  });
  readonly backendCropSummary = computed(() => {
    const blockCrop = this.profitData()?.block_crop?.trim() || this.currentCrop()?.requested_crop?.trim();
    const matchedCrop = this.currentCrop()?.matched_crop?.trim();
    const matchType = this.currentCrop()?.match_type?.trim().toLowerCase();

    if (!matchedCrop || !blockCrop || matchType === 'exact') {
      return null;
    }

    const displayBlockCrop = this.getChartLabel(blockCrop);
    const displayMatchedCrop = this.getChartLabel(matchedCrop);

    if (this.normalizeCropKey(displayBlockCrop) === this.normalizeCropKey(displayMatchedCrop)) {
      return null;
    }

    return `Workbook benchmark used: ${displayMatchedCrop}`;
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

    return this.buildOrderedChartRows(desiredOrder);
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

    return this.buildOrderedChartRows(desiredOrder);
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
          y: this.getRevenuePerMl(row),
          r: Math.max(10, Math.min(22, Math.abs(row.margins.selected) / 800))
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
              `Revenue per ML: ${this.formatCurrency(point.y)}/ML`
            ];
          }
        }
      }
    },
    scales: {
      x: {
        min: 2,
        max: 14,
        title: {
          display: true,
          text: 'Water requirement (ML / ha)',
          color: '#4b5563',
          font: { size: 12 }
        },
        ticks: {
          color: '#111827',
          stepSize: 2
        },
        grid: { color: '#e6e9ef' },
        border: { color: '#c7cfd8' }
      },
      y: {
        min: -2000,
        max: 14000,
        title: {
          display: true,
          text: 'Revenue per ML of water (AUD / ML)',
          color: '#4b5563',
          font: { size: 12 }
        },
        ticks: {
          color: '#111827',
          stepSize: 2000,
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
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) {
        return;
      }

      const yScale = scales?.y;
      if (!yScale) {
        return;
      }

      const guideY = yScale.getPixelForValue(ProfitRiskComponent.MIN_VIABLE_REVENUE_PER_ML);
      if (!Number.isFinite(guideY)) {
        return;
      }

      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, guideY);
      ctx.lineTo(chartArea.right, guideY);
      ctx.stroke();
      ctx.setLineDash([]);

      const legendText = `Approx. min viable ($${ProfitRiskComponent.MIN_VIABLE_REVENUE_PER_ML}/ML)`;
      ctx.font = '600 11px Arial';
      const textWidth = ctx.measureText(legendText).width;
      const legendWidth = textWidth + 42;
      const legendHeight = 24;
      const legendX = chartArea.right - legendWidth - 6;
      const legendY = chartArea.top + 6;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 4);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(legendX + 8, legendY + legendHeight / 2);
      ctx.lineTo(legendX + 30, legendY + legendHeight / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#3f3f46';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(legendText, legendX + 34, legendY + legendHeight / 2 + 0.5);
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

    return `${this.displayCropLabel()} is currently running ${profitabilityText} at ${this.formatCurrency(data.water_price)}/ML water cost.`;
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

  getRevenuePerHa(row: ProfitRiskCropRow): number {
    const normalizedCrop = this.normalizeCropKey(row.crop);
    if (normalizedCrop.includes('olive oil')) {
      return row.current_price * 7000;
    }

    return row.current_price * row.yield_t_ha;
  }

  getRevenuePerMl(row: ProfitRiskCropRow): number {
    const waterRequirement = Number(row.water_req_ml_ha);
    if (!Number.isFinite(waterRequirement) || waterRequirement <= 0) {
      return 0;
    }

    return this.getRevenuePerHa(row) / waterRequirement;
  }

  private buildOrderedChartRows(desiredOrder: string[]): ProfitRiskCropRow[] {
    const rows = this.marginRows();
    const rowsByCrop = new Map(rows.map(row => [row.crop, row]));
    const orderedRows = desiredOrder
      .map(crop => rowsByCrop.get(crop))
      .filter((row): row is ProfitRiskCropRow => !!row);

    const currentRow = this.resolveCurrentChartRow(rows);
    if (!currentRow) {
      return orderedRows;
    }

    return orderedRows.some(row => row.crop === currentRow.crop)
      ? orderedRows
      : [currentRow, ...orderedRows];
  }

  private resolveCurrentChartRow(rows: ProfitRiskCropRow[]): ProfitRiskCropRow | null {
    const candidates = [
      this.currentCrop()?.matched_crop,
      this.currentCrop()?.requested_crop,
      this.selectedBlock()?.crop,
      this.profitData()?.block_crop
    ];

    for (const candidate of candidates) {
      const match = this.findCropRow(rows, candidate);
      if (match) {
        return match;
      }
    }

    return null;
  }

  private findCropRow(rows: ProfitRiskCropRow[], candidate: string | null | undefined): ProfitRiskCropRow | null {
    const normalizedCandidate = this.normalizeCropKey(candidate);
    if (!normalizedCandidate) {
      return null;
    }

    return rows.find(row => {
      const normalizedCrop = this.normalizeCropKey(row.crop);
      return normalizedCrop === normalizedCandidate
        || normalizedCrop.includes(normalizedCandidate)
        || normalizedCandidate.includes(normalizedCrop);
    }) ?? null;
  }

  private normalizeCropKey(value: string | null | undefined): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .replaceAll('—', ' ')
      .replaceAll('–', ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
    const blockIdentifier = block.id || block.lan;
    const url = `${environment.apiBaseUrl}/api/blocks/${blockIdentifier}/profit-risk?water_price=${waterPrice}`;

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
