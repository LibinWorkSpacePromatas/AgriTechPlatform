import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChartSeries {
  name: string;
  data: Array<number | null>;
  color: string;
  unit: string;
}

interface ChartPoint {
  x: number;
  y: number | null;
}

interface RenderedSeries extends ChartSeries {
  points: ChartPoint[];
  linePath: string;
  areaPath: string;
}

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-container" [style.height.px]="height" (mousemove)="onMouseMove($event)" (mouseleave)="onMouseLeave()">
      <svg [attr.viewBox]="viewBox" class="chart-svg" #svgRef>
        <defs>
          <ng-container *ngFor="let s of normalizedSeries; let i = index">
            <linearGradient [id]="gradientId + i" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" [attr.stop-color]="s.color" stop-opacity="0.16" />
              <stop offset="100%" [attr.stop-color]="s.color" stop-opacity="0.02" />
            </linearGradient>
          </ng-container>
        </defs>

        <g *ngIf="showAxes">
          <line *ngFor="let tick of yTicks"
            [attr.x1]="paddingLeft"
            [attr.y1]="getY(tick)"
            [attr.x2]="width - paddingRight"
            [attr.y2]="getY(tick)"
            stroke="#e8eef2"
            stroke-width="1" />
        </g>

        <ng-container *ngFor="let s of renderedSeries; let i = index">
          <path *ngIf="s.areaPath"
            [attr.d]="s.areaPath"
            [attr.fill]="'url(#' + gradientId + i + ')'"
            fill-opacity="1" />
        </ng-container>

        <path *ngFor="let s of renderedSeries"
          [attr.d]="s.linePath"
          [attr.stroke]="s.color"
          fill="none"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round" />

        <ng-container *ngFor="let s of renderedSeries">
          <ng-container *ngFor="let point of s.points">
            <circle *ngIf="point.y !== null"
              [attr.cx]="point.x"
              [attr.cy]="point.y"
              r="2.5"
              [attr.fill]="s.color"
              fill-opacity="0.9" />
          </ng-container>
        </ng-container>

        <g *ngFor="let index of noDataIndices">
          <line
            [attr.x1]="pointXs[index]"
            [attr.y1]="getNoDataMarkerY() + 8"
            [attr.x2]="pointXs[index]"
            [attr.y2]="height - paddingBottom"
            stroke="#f59e0b"
            stroke-dasharray="3,4"
            stroke-width="1"
            stroke-opacity="0.55" />
          <circle
            [attr.cx]="pointXs[index]"
            [attr.cy]="getNoDataMarkerY()"
            r="5"
            fill="#fff7ed"
            stroke="#d97706"
            stroke-width="1.5" />
        </g>

        <g *ngIf="hoverIndex !== null">
          <line
            [attr.x1]="pointXs[hoverIndex]"
            [attr.y1]="paddingTop"
            [attr.x2]="pointXs[hoverIndex]"
            [attr.y2]="height - paddingBottom"
            stroke="#94a3b8"
            stroke-dasharray="4,4"
            stroke-width="1" />

          <ng-container *ngFor="let s of renderedSeries">
            <circle *ngIf="s.points[hoverIndex].y !== null"
              [attr.cx]="s.points[hoverIndex].x"
              [attr.cy]="s.points[hoverIndex].y"
              r="4.5"
              [attr.fill]="s.color"
              stroke="#ffffff"
              stroke-width="2" />
          </ng-container>

          <circle *ngIf="isNoDataIndex(hoverIndex)"
            [attr.cx]="pointXs[hoverIndex]"
            [attr.cy]="getNoDataMarkerY()"
            r="6.5"
            fill="#fff7ed"
            stroke="#b45309"
            stroke-width="2" />
        </g>

        <g *ngIf="showAxes">
          <text *ngFor="let tick of yTicks"
            [attr.x]="paddingLeft - 8"
            [attr.y]="getY(tick) + 4"
            text-anchor="end"
            font-size="11"
            fill="#64748b">
            {{ formatTick(tick) }}
          </text>
        </g>

        <g *ngIf="showAxes">
          <ng-container *ngFor="let index of visibleLabelIndices">
            <text
              [attr.x]="pointXs[index]"
              [attr.y]="height - 10"
              [attr.text-anchor]="getLabelAnchor(index)"
              font-size="11"
              fill="#94a3b8">
              {{ currentLabels[index] }}
            </text>
          </ng-container>
        </g>
      </svg>

      <div class="chart-tooltip" *ngIf="hoverIndex !== null"
        [style.left.px]="tooltipPos.x"
        [style.top.px]="tooltipPos.y">
        <div class="tooltip-time">{{ currentLabels[hoverIndex] }}</div>
        <div class="tooltip-note" *ngIf="isNoDataIndex(hoverIndex)">No usable satellite data for this date.</div>
        <div class="tooltip-row" *ngFor="let s of normalizedSeries">
          <span class="row-label" [style.color]="s.color">{{ s.name }}</span>
          <span class="row-value">{{ formatValue(s.data[hoverIndex], s.unit) }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chart-container {
      width: 100%;
      min-height: 160px;
      position: relative;
    }

    .chart-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
      display: block;
    }

    .chart-tooltip {
      position: absolute;
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid #dbe4ea;
      border-radius: 10px;
      padding: 10px 12px;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
      pointer-events: none;
      z-index: 100;
      min-width: 140px;
      transform: translate(10px, -50%);
    }

    .tooltip-time {
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 8px;
      font-size: 0.82rem;
    }

    .tooltip-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.78rem;
      margin-bottom: 4px;
    }

    .tooltip-row:last-child {
      margin-bottom: 0;
    }

    .tooltip-note {
      color: #9a3412;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 0.76rem;
      font-weight: 600;
      line-height: 1.35;
      margin-bottom: 8px;
    }

    .row-label {
      font-weight: 600;
    }

    .row-value {
      font-weight: 700;
      color: #0f172a;
    }
  `]
})
export class LineChartComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() series: ChartSeries[] = [];
  @Input() labels: string[] = [];
  @Input() showAxes = true;
  @Input() height = 200;
  @Input() minY?: number;
  @Input() maxY?: number;
  @Input() forceAllLabels = false;

  @Input() data: Array<number | null> = [];
  @Input() color = '#10b981';
  @Input() label = 'Value';

  @ViewChild('svgRef') svgRef!: ElementRef<SVGElement>;

  width = 600;
  readonly paddingTop = 18;
  readonly paddingRight = 18;
  readonly paddingBottom = 38;
  readonly paddingLeft = 46;

  viewBox = `0 0 ${this.width} ${this.height}`;
  gradientId = 'chartGrad-' + Math.random().toString(36).slice(2, 7);

  normalizedSeries: ChartSeries[] = [];
  renderedSeries: RenderedSeries[] = [];
  currentLabels: string[] = [];
  pointXs: number[] = [];
  visibleLabelIndices: number[] = [];
  noDataIndices: number[] = [];
  yTicks: number[] = [];

  hoverIndex: number | null = null;
  tooltipPos = { x: 0, y: 0 };

  private rangeMin = 0;
  private rangeMax = 1;
  private tickDecimals = 2;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private el: ElementRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['series'] || changes['labels'] || changes['data'] || changes['minY'] || changes['maxY'] || changes['height'] || changes['forceAllLabels']) {
      this.drawChart();
    }
  }

  ngAfterViewInit(): void {
    this.setupResizeObserver();
    this.drawChart();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.pointXs.length || !this.svgRef) {
      return;
    }

    const rect = this.svgRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    this.pointXs.forEach((pointX, index) => {
      const distance = Math.abs(pointX - x);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    this.hoverIndex = closestIndex;
    const tooltipX = this.pointXs[closestIndex] > this.width - 170
      ? this.pointXs[closestIndex] - 160
      : this.pointXs[closestIndex];
    const clampedY = Math.max(this.paddingTop + 24, Math.min(y, this.height - this.paddingBottom - 12));

    this.tooltipPos = { x: tooltipX, y: clampedY };
  }

  onMouseLeave(): void {
    this.hoverIndex = null;
  }

  getY(value: number): number {
    const usableHeight = this.height - this.paddingTop - this.paddingBottom;
    const range = this.rangeMax - this.rangeMin || 1;
    return this.height - this.paddingBottom - ((value - this.rangeMin) / range) * usableHeight;
  }

  getLabelAnchor(index: number): 'start' | 'middle' | 'end' {
    if (index === 0) {
      return 'start';
    }

    if (index === this.currentLabels.length - 1) {
      return 'end';
    }

    return 'middle';
  }

  getNoDataMarkerY(): number {
    return this.paddingTop + 14;
  }

  isNoDataIndex(index: number): boolean {
    return this.noDataIndices.includes(index);
  }

  formatTick(value: number): string {
    if (this.tickDecimals === 0) {
      return Math.round(value).toString();
    }

    return value.toFixed(this.tickDecimals).replace(/0+$/, '').replace(/\.$/, '');
  }

  formatValue(value: number | null, unit: string): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'No data';
    }

    const formatted = Number.isInteger(value)
      ? value.toString()
      : Math.abs(value) >= 1
        ? value.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')
        : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');

    return `${formatted}${unit ? ` ${unit}` : ''}`.trim();
  }

  private setupResizeObserver(): void {
    const element = this.el.nativeElement.querySelector('.chart-container');
    if (!element) {
      return;
    }

    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          this.width = entry.contentRect.width;
          this.viewBox = `0 0 ${this.width} ${this.height}`;
          this.drawChart();
        }
      }
    });

    this.resizeObserver.observe(element);
  }

  private drawChart(): void {
    this.normalizedSeries = this.getNormalizedSeries();
    const dataLength = Math.max(...this.normalizedSeries.map(series => series.data.length), 0);

    if (!this.normalizedSeries.length || dataLength === 0) {
      this.renderedSeries = [];
      this.currentLabels = [];
      this.pointXs = [];
      this.visibleLabelIndices = [];
      this.noDataIndices = [];
      this.yTicks = [];
      this.hoverIndex = null;
      return;
    }

    this.currentLabels = Array.from({ length: dataLength }, (_, index) => this.labels[index] || `Point ${index + 1}`);
    this.pointXs = this.buildPointXs(dataLength);

    const allData = this.normalizedSeries
      .flatMap(series => series.data)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const { min, max } = this.computeRange(allData);
    this.rangeMin = min;
    this.rangeMax = max;
    this.tickDecimals = this.resolveTickDecimals(max - min);
    this.yTicks = this.buildTicks(min, max);
    this.visibleLabelIndices = this.buildVisibleLabelIndices(dataLength);
    this.noDataIndices = Array.from({ length: dataLength }, (_, index) => index)
      .filter(index => this.normalizedSeries.every(series => {
        const value = series.data[index];
        return typeof value !== 'number' || !Number.isFinite(value);
      }));

    this.renderedSeries = this.normalizedSeries.map(series => {
      const points = series.data.map((value, index) => ({
        x: this.pointXs[index],
        y: typeof value === 'number' ? this.getY(value) : null
      }));

      const linePath = this.buildLinePath(points);
      const areaPath = this.buildAreaPath(points);

      return { ...series, points, linePath, areaPath };
    });

    this.viewBox = `0 0 ${this.width} ${this.height}`;
  }

  private getNormalizedSeries(): ChartSeries[] {
    if (this.series.length) {
      return this.series.filter(series => series.data.length > 0);
    }

    if (!this.data.length) {
      return [];
    }

    return [{
      name: this.label,
      data: [...this.data],
      color: this.color,
      unit: ''
    }];
  }

  private buildPointXs(dataLength: number): number[] {
    if (dataLength === 1) {
      return [this.paddingLeft + (this.width - this.paddingLeft - this.paddingRight) / 2];
    }

    const usableWidth = this.width - this.paddingLeft - this.paddingRight;
    const step = usableWidth / (dataLength - 1);
    return Array.from({ length: dataLength }, (_, index) => this.paddingLeft + step * index);
  }

  private computeRange(allData: number[]): { min: number; max: number } {
    let min = this.minY ?? Math.min(...allData);
    let max = this.maxY ?? Math.max(...allData);

    if (this.minY === undefined || this.maxY === undefined) {
      if (min === max) {
        const fallbackPadding = Math.abs(min || 1) * 0.15 || 0.2;
        min -= fallbackPadding;
        max += fallbackPadding;
      } else {
        const padding = (max - min) * 0.12;
        if (this.minY === undefined) {
          min -= padding;
        }
        if (this.maxY === undefined) {
          max += padding;
        }
      }
    }

    if (min === max) {
      min -= 1;
      max += 1;
    }

    return { min, max };
  }

  private buildTicks(min: number, max: number): number[] {
    const tickCount = 5;
    return Array.from({ length: tickCount }, (_, index) => {
      const value = max - ((max - min) * index) / (tickCount - 1);
      return Number(value.toFixed(Math.min(this.tickDecimals + 2, 8)));
    });
  }

  private resolveTickDecimals(range: number): number {
    if (range >= 100) {
      return 0;
    }

    if (range >= 10) {
      return 1;
    }

    if (range >= 1) {
      return 2;
    }

    if (range >= 0.1) {
      return 3;
    }

    if (range >= 0.01) {
      return 4;
    }

    if (range >= 0.001) {
      return 5;
    }

    return 6;
  }

  private buildVisibleLabelIndices(dataLength: number): number[] {
    if (this.forceAllLabels) {
      return Array.from({ length: dataLength }, (_, index) => index);
    }

    if (dataLength <= 1) {
      return [0];
    }

    const maxVisibleLabels = Math.max(2, Math.floor((this.width - this.paddingLeft - this.paddingRight) / 88));
    if (dataLength <= maxVisibleLabels) {
      return Array.from({ length: dataLength }, (_, index) => index);
    }

    const indices = new Set<number>([0, dataLength - 1]);
    const interiorSlots = maxVisibleLabels - 2;

    for (let slot = 1; slot <= interiorSlots; slot += 1) {
      const index = Math.round((slot * (dataLength - 1)) / (interiorSlots + 1));
      indices.add(index);
    }

    const sortedIndices = Array.from(indices).sort((left, right) => left - right);
    const dedupedIndices: number[] = [];

    sortedIndices.forEach(index => {
      const currentLabel = this.currentLabels[index];
      const previousIndex = dedupedIndices[dedupedIndices.length - 1];
      const previousLabel = previousIndex === undefined ? null : this.currentLabels[previousIndex];

      if (previousLabel === currentLabel) {
        dedupedIndices[dedupedIndices.length - 1] = index;
        return;
      }

      dedupedIndices.push(index);
    });

    return dedupedIndices;
  }

  private buildLinePath(points: ChartPoint[]): string {
    if (!points.length) {
      return '';
    }

    let path = '';
    let activeSegment: Array<{ x: number; y: number }> = [];

    const flushSegment = (): void => {
      if (!activeSegment.length) {
        return;
      }

      if (activeSegment.length === 1) {
        const point = activeSegment[0];
        const leftX = Math.max(this.paddingLeft, point.x - 10);
        const rightX = Math.min(this.width - this.paddingRight, point.x + 10);
        path += `${path ? ' ' : ''}M ${leftX} ${point.y} L ${rightX} ${point.y}`;
      } else {
        activeSegment.forEach((point, index) => {
          path += `${path ? ' ' : ''}${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
        });
      }

      activeSegment = [];
    };

    points.forEach(point => {
      if (point.y === null) {
        flushSegment();
        return;
      }

      activeSegment.push({ x: point.x, y: point.y });
    });

    flushSegment();

    return path;
  }

  private buildAreaPath(points: ChartPoint[]): string {
    const numericPoints = points.filter((point): point is { x: number; y: number } => point.y !== null);
    if (numericPoints.length < 2 || numericPoints.length !== points.length) {
      return '';
    }

    const linePath = this.buildLinePath(points);
    if (!linePath) {
      return '';
    }

    return `${linePath} L ${numericPoints[numericPoints.length - 1].x} ${this.height - this.paddingBottom} L ${numericPoints[0].x} ${this.height - this.paddingBottom} Z`;
  }
}
