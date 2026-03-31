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
  PointElement,
  Plugin,
  Tooltip
} from 'chart.js';
import { distinctUntilChanged, filter } from 'rxjs';
import {
  AlertTriangle,
  BarChart3,
  DollarSign,
  Droplets,
  LucideAngularModule,
  ShieldCheck,
  Sprout,
  TrendingUp
} from 'lucide-angular';

import { environment } from '../../../environments/environment';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import { AdelaideTimePipe } from '../../shared/pipes/adelaide-time.pipe';

Chart.register(BarController, BarElement, BubbleController, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

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
  revenue_ha?: number;
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
  delivery_cost_ml: number | null;
  net_margin: number;
}

interface ProfitRiskResponse {
  block_id: string;
  block_name: string;
  block_crop: string;
  water_price: number;
  delivery_cost_ml: number | null;
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
  readonly marginChartOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const values = this.chartRows().flatMap(row => [row.margins.low, row.margins.selected, row.margins.high]);
    const maxAbs = Math.max(1, ...values.map(value => Math.abs(value)));
    const step = 2500;
    const padded = Math.max(step, Math.ceil((maxAbs * 1.15) / step) * step);

    return {
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
            label: context => `${context.dataset.label}: ${this.formatCurrency(Number(context.raw))}/ha`
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
          min: -padded,
          max: padded,
          ticks: {
            stepSize: step,
            color: '#4b5563',
            callback: value => this.formatCurrency(Number(value))
          },
          title: {
            display: true,
            text: 'Net margin (AUD / hectare)',
            color: '#4b5563',
            font: { size: 12 }
          },
          grid: {
            color: context => Number(context.tick.value) === 0 ? '#374151' : '#e5e7eb',
            lineWidth: context => Number(context.tick.value) === 0 ? 1.4 : 1
          },
          border: { color: '#aeb6c2' }
        }
      }
    };
  });
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
    afterDatasetsDraw: chart => {
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
  readonly priceChartOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const maxValue = Math.max(
      1,
      ...this.priceChartRows().flatMap(row => [row.current_price, row.break_even_price])
    );
    const upper = Math.max(1000, Math.ceil((maxValue * 1.2) / 1000) * 1000);
    const step = 1000;

    return {
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
            label: context => `${context.dataset.label}: ${this.formatCurrency(Number(context.raw))}`
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: upper,
          ticks: {
            stepSize: step,
            color: '#111827',
            callback: value => this.formatCurrency(Number(value))
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
  });
  readonly revenueMlRows = computed(() => {
    const allowedLabels = new Set([
      'Olives EVOO',
      'Table Grapes',
      'Mandarins',
      'Citrus Oranges',
      'Peaches',
      'Chardonnay',
      'Shiraz',
      'Almonds'
    ]);

    return this.marginRows()
      .filter(row =>
        row.water_req_ml_ha > 0 &&
        row.current_price > 0 &&
        row.yield_t_ha > 0 &&
        allowedLabels.has(this.getChartLabel(row.crop))
      )
      .sort((left, right) => {
        const revenueGap = this.getRevenuePerMl(right) - this.getRevenuePerMl(left);
        if (Math.abs(revenueGap) > 0.001) {
          return revenueGap;
        }
        return left.water_req_ml_ha - right.water_req_ml_ha;
      });
  });
  readonly revenueMlChartData = computed<ChartData<'bubble'>>(() => {
    const rows = this.revenueMlRows();
    if (rows.length === 0) {
      return { datasets: [] };
    }

    const revenueHaValues = rows.map(row => this.getRevenuePerHa(row));
    const minRevenueHa = Math.min(...revenueHaValues);
    const maxRevenueHa = Math.max(...revenueHaValues);
    return {
      datasets: [
        {
          label: 'Revenue per ML',
          data: rows.map(row => {
            const revenuePerMl = this.getRevenuePerMl(row);
            return {
              x: row.water_req_ml_ha,
              y: revenuePerMl,
              r: this.getScaledBubbleRadius(this.getRevenuePerHa(row), minRevenueHa, maxRevenueHa)
            };
          }),
          backgroundColor: rows.map(row => this.getRevenueBubbleColor(row.crop)),
          borderColor: '#ffffff',
          borderWidth: 1.5,
          hoverBorderWidth: 2
        }
      ]
    };
  });
  readonly revenueMlOverlayPlugin: Plugin<'bubble'> = {
    id: 'revenueMlOverlay',
    afterDraw: chart => {
      const rows = this.revenueMlRows();
      const points = chart.getDatasetMeta(0).data;
      const xScale = chart.scales['x'];
      const yScale = chart.scales['y'];
      const ctx = chart.ctx;
      if (!xScale || !yScale) {
        return;
      }
      if (rows.length === 0 || points.length === 0) {
        return;
      }
      const minViable = this.getMinViableRevenuePerMl();
      const y = yScale.getPixelForValue(minViable);
      ctx.save();
      ctx.strokeStyle = '#e39a95';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(xScale.left, y);
      ctx.lineTo(xScale.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const legendText = `Approx. min viable (${this.formatCurrency(minViable)}/ML)`;
      ctx.font = '500 11px Arial';
      const textWidth = ctx.measureText(legendText).width;
      const boxWidth = textWidth + 34;
      const boxHeight = 22;
      const boxX = xScale.right - boxWidth - 8;
      const boxY = yScale.top + 8;
      ctx.fillStyle = '#f7f7f7';
      ctx.strokeStyle = '#c8c8c8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
      ctx.fill();
      ctx.stroke();
      const lineY = boxY + boxHeight / 2;
      ctx.strokeStyle = '#e39a95';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(boxX + 8, lineY);
      ctx.lineTo(boxX + 30, lineY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#4b5563';
      ctx.textBaseline = 'middle';
      ctx.fillText(legendText, boxX + 34, lineY);
      ctx.font = '600 12px Arial';
      ctx.fillStyle = '#585858';
      type LabelBox = { left: number; top: number; right: number; bottom: number };
      const overlaps = (a: LabelBox, b: LabelBox): boolean =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

      const occupied: LabelBox[] = [{ left: boxX, top: boxY, right: boxX + boxWidth, bottom: boxY + boxHeight }];
      const labelHeight = 16;
      const chartBounds: LabelBox = {
        left: xScale.left + 4,
        top: yScale.top + 4,
        right: xScale.right - 4,
        bottom: yScale.bottom - 4
      };

      rows
        .map((row, index) => ({ row, point: points[index], index }))
        .filter(item => !!item.point)
        .sort((a, b) => {
          const aRadius = Number((a.point!.options as { radius?: number }).radius ?? 12);
          const bRadius = Number((b.point!.options as { radius?: number }).radius ?? 12);
          return bRadius - aRadius;
        })
        .forEach(item => {
          const point = item.point!;
          const label = this.getChartLabel(item.row.crop);
          const radius = Number((point.options as { radius?: number }).radius ?? 12);
          const labelWidth = ctx.measureText(label).width;

          const fixedOffsets: Record<string, { x: number; y: number }> = {
            'Olives EVOO': { x: 20, y: -18 },
            'Table Grapes': { x: 20, y: -16 },
            'Mandarins': { x: 18, y: -22 },
            'Citrus Oranges': { x: 14, y: -10 },
            'Peaches': { x: -38, y: -8 },
            'Chardonnay': { x: 16, y: -18 },
            'Shiraz': { x: 16, y: 14 },
            'Almonds': { x: 14, y: -12 }
          };

          const preferred = fixedOffsets[label];
          if (preferred) {
            const x = Math.min(
              Math.max(point.x + preferred.x, chartBounds.left),
              chartBounds.right - labelWidth
            );
            const y = Math.min(
              Math.max(point.y + preferred.y, chartBounds.top + labelHeight),
              chartBounds.bottom
            );
            const preferredBox: LabelBox = {
              left: x,
              top: y - labelHeight + 2,
              right: x + labelWidth,
              bottom: y + 2
            };
            const collision = occupied.some(taken => overlaps(preferredBox, taken));
            if (!collision) {
              occupied.push(preferredBox);
              ctx.fillText(label, preferredBox.left, preferredBox.bottom - 2);
              return;
            }
          }

          const candidateOffsets = [
            { x: radius + 8, y: -(radius + 4) },
            { x: radius + 8, y: radius + 12 },
            { x: -(labelWidth + radius + 8), y: -(radius + 4) },
            { x: -(labelWidth + radius + 8), y: radius + 12 },
            { x: -labelWidth / 2, y: -(radius + 10) },
            { x: -labelWidth / 2, y: radius + 16 },
            { x: radius + 22, y: -(radius + 14) },
            { x: radius + 22, y: radius + 20 },
            { x: -(labelWidth + radius + 22), y: -(radius + 14) },
            { x: -(labelWidth + radius + 22), y: radius + 20 }
          ];

          let selected: LabelBox | null = null;
          for (const offset of candidateOffsets) {
            const x = point.x + offset.x;
            const y = point.y + offset.y;
            const box: LabelBox = {
              left: x,
              top: y - labelHeight + 2,
              right: x + labelWidth,
              bottom: y + 2
            };

            const inBounds =
              box.left >= chartBounds.left &&
              box.right <= chartBounds.right &&
              box.top >= chartBounds.top &&
              box.bottom <= chartBounds.bottom;
            const collision = occupied.some(taken => overlaps(box, taken));
            if (inBounds && !collision) {
              selected = box;
              break;
            }
          }

          if (!selected) {
            const baseX = Math.min(
              Math.max(point.x + radius + 8, chartBounds.left),
              chartBounds.right - labelWidth
            );
            const baseY = Math.min(
              Math.max(point.y - (radius + 4), chartBounds.top + labelHeight),
              chartBounds.bottom
            );

            const xSearch = [0, 24, -24, 48, -48, 72, -72, 96, -96];
            const ySearch = [0, 16, -16, 30, -30, 44, -44, 58, -58, 72, -72, 86, -86, 100, -100];
            for (const dx of xSearch) {
              const xText = Math.min(
                Math.max(baseX + dx, chartBounds.left),
                chartBounds.right - labelWidth
              );
              for (const dy of ySearch) {
                const yText = Math.min(
                  Math.max(baseY + dy, chartBounds.top + labelHeight),
                  chartBounds.bottom
                );
                const box: LabelBox = {
                  left: xText,
                  top: yText - labelHeight + 2,
                  right: xText + labelWidth,
                  bottom: yText + 2
                };

                const collision = occupied.some(taken => overlaps(box, taken));
                if (!collision) {
                  selected = box;
                  break;
                }
              }
              if (selected) {
                break;
              }
            }

            if (!selected) {
              selected = {
                left: baseX,
                top: baseY - labelHeight + 2,
                right: baseX + labelWidth,
                bottom: baseY + 2
              };
            }
          }

          occupied.push(selected);
          ctx.fillText(label, selected.left, selected.bottom - 2);
        });
      ctx.restore();
    }
  };
  readonly revenueMlChartOptions = computed<ChartConfiguration<'bubble'>['options']>(() => {
    const rows = this.revenueMlRows();
    if (rows.length === 0) {
      return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false
      };
    }

    const revenues = rows.map(row => this.getRevenuePerMl(row));
    const waterUse = rows.map(row => row.water_req_ml_ha);
    const minViable = this.getMinViableRevenuePerMl();
    const minWater = Math.min(...waterUse);
    const maxWater = Math.max(...waterUse);
    const xMin = Math.min(4, Math.floor(minWater));
    const xMax = Math.max(14, Math.ceil(maxWater));
    const xStep = 2;
    const minRevenue = Math.min(0, minViable, ...revenues);
    const maxRevenue = Math.max(minViable, ...revenues);
    const yRange = Math.max(100, maxRevenue - minRevenue);
    const yMin = 0;
    const yMax = Math.max(2000, Math.ceil((maxRevenue + yRange * 0.08) / 2000) * 2000);
    const yStep = 2000;
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => {
              const index = items[0]?.dataIndex ?? 0;
              const row = rows[index];
              return row ? this.getChartLabel(row.crop) : '';
            },
            label: context => {
              const row = rows[context.dataIndex];
              if (!row) {
                return '';
              }
              return `Revenue/ML ${this.formatCurrency(this.getRevenuePerMl(row))} - Water ${row.water_req_ml_ha.toFixed(1)} ML/ha`;
            }
          }
        }
      },
      scales: {
        x: {
          min: xMin,
          max: xMax,
          ticks: {
            stepSize: xStep,
            color: '#374151'
          },
          title: {
            display: true,
            text: 'Water use (ML per hectare)',
            color: '#4b5563',
            font: { size: 12 }
          },
          grid: { color: '#d2d6db' },
          border: { color: '#c5c9cf' }
        },
        y: {
          min: yMin,
          max: yMax,
          ticks: {
            stepSize: yStep,
            color: '#374151',
            callback: value => this.formatCurrency(Number(value)),
            precision: 0
          },
          title: {
            display: true,
            text: 'Revenue per ML of water (AUD)',
            color: '#4b5563',
            font: { size: 12 }
          },
          grid: { color: '#d2d6db' },
          border: { color: '#c5c9cf' }
        }
      }
    };
  });
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

  getRevenuePerMl(row: ProfitRiskCropRow): number {
    if (!row.water_req_ml_ha) {
      return 0;
    }

    return this.getRevenuePerHa(row) / row.water_req_ml_ha;
  }

  getRevenuePerHa(row: ProfitRiskCropRow): number {
    if (this.getChartLabel(row.crop) === 'Olives EVOO') {
      return 49_000;
    }

    if (typeof row.revenue_ha === 'number' && !Number.isNaN(row.revenue_ha)) {
      return row.revenue_ha;
    }

    return row.current_price * row.yield_t_ha;
  }

  getRevenueBubbleColor(crop: string): string {
    const label = this.getChartLabel(crop);
    let hash = 0;
    for (let i = 0; i < label.length; i += 1) {
      hash = ((hash << 5) - hash) + label.charCodeAt(i);
      hash |= 0;
    }

    const hue = Math.abs(hash) % 360;
    return `hsla(${hue}, 67%, 58%, 0.82)`;
  }

  getScaledBubbleRadius(revenuePerMl: number, minRevenue: number, maxRevenue: number): number {
    const minRadius = 8;
    const maxRadius = 14;
    if (maxRevenue <= minRevenue) {
      return (minRadius + maxRadius) / 2;
    }

    const normalized = (revenuePerMl - minRevenue) / (maxRevenue - minRevenue);
    return minRadius + (maxRadius - minRadius) * normalized;
  }

  getMinViableRevenuePerMl(): number {
    const data = this.profitData();
    const deliveryCost = data?.delivery_cost_ml ?? data?.current_crop?.delivery_cost_ml ?? 0;
    return Math.max(0, Math.round(this.waterPrice() + deliveryCost));
  }

  getNiceStep(range: number, targetTicks: number): number {
    const rough = Math.max(1, range / Math.max(2, targetTicks));
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const scaled = rough / power;

    if (scaled <= 1) {
      return power;
    }
    if (scaled <= 2) {
      return 2 * power;
    }
    if (scaled <= 5) {
      return 5 * power;
    }
    return 10 * power;
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

