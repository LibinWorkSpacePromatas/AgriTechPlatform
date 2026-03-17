import { Component, Input, OnChanges, SimpleChanges, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ChartSeries {
  name: string;
  data: number[];
  color: string;
  unit: string;
}

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chart-container" (window:resize)="onResize()" (mousemove)="onMouseMove($event)" (mouseleave)="onMouseLeave()">
      <svg [attr.viewBox]="viewBox" class="chart-svg" #svgRef>
        <defs>
          <ng-container *ngFor="let s of series; let i = index">
            <linearGradient [id]="gradientId + i" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" [attr.stop-color]="s.color" stop-opacity="0.1"/>
              <stop offset="100%" [attr.stop-color]="s.color" stop-opacity="0"/>
            </linearGradient>
          </ng-container>
        </defs>
        
        <!-- Grid Lines -->
        <g *ngIf="showAxes" class="grid-lines">
             <line *ngFor="let tick of yTicks" 
                [attr.x1]="padding" 
                [attr.y1]="getY(tick)" 
                [attr.x2]="width - padding" 
                [attr.y2]="getY(tick)" 
                stroke="#f3f4f6" 
                stroke-dasharray="0"
            />
        </g>

        <!-- Area Fills -->
        <path *ngFor="let s of computedSeries; let i = index" 
            [attr.d]="s.areaPath" 
            [attr.fill]="'url(#' + gradientId + i + ')'" 
            class="area-path"/>

        <!-- Line Paths -->
        <path *ngFor="let s of computedSeries" 
            [attr.d]="s.linePath" 
            [attr.stroke]="s.color" 
            fill="none" 
            class="line-path" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round"/>

        <!-- Hover vertical line -->
        <line *ngIf="hoverIndex !== null"
            [attr.x1]="points[hoverIndex].x"
            [attr.y1]="padding"
            [attr.x2]="points[hoverIndex].x"
            [attr.y2]="height - padding"
            stroke="#9ca3af"
            stroke-dasharray="4,2"
            stroke-width="1"
        />

        <!-- Hover data points -->
        <g *ngIf="hoverIndex !== null">
            <circle *ngFor="let s of computedSeries"
                [attr.cx]="s.points[hoverIndex].x"
                [attr.cy]="s.points[hoverIndex].y"
                r="4"
                [attr.fill]="s.color"
                stroke="white"
                stroke-width="2"
            />
        </g>
        
        <!-- X Axis Labels (Simplified to avoid overlap) -->
         <g *ngIf="showAxes">
             <ng-container *ngFor="let label of labels; let i = index">
                <text *ngIf="(labels.length - 1 - i) % labelStep === 0"
                    [attr.x]="points[i].x" 
                    [attr.y]="height - 5" 
                    text-anchor="middle" 
                    font-size="10" 
                    fill="#9ca3af">
                    {{label}}
                </text>
             </ng-container>
         </g>

         <!-- Y Axis Labels -->
         <g *ngIf="showAxes">
             <text *ngFor="let tick of yTicks"
                [attr.x]="padding - 5"
                [attr.y]="getY(tick) + 4"
                text-anchor="end"
                font-size="10"
                fill="#9ca3af">
                {{tick}}
             </text>
         </g>
      </svg>

      <!-- Float Tooltip -->
      <div class="chart-tooltip" *ngIf="hoverIndex !== null" 
           [style.left.px]="tooltipPos.x" 
           [style.top.px]="tooltipPos.y">
          <div class="tooltip-time">{{labels[hoverIndex]}}</div>
          <div class="tooltip-row" *ngFor="let s of series">
              <span class="row-label" [style.color]="s.color">{{s.name}} :</span>
              <span class="row-value">{{s.data[hoverIndex]}}</span>
          </div>
      </div>
    </div>
  `,
  styles: [`
    .chart-container {
      width: 100%;
      height: 100%;
      min-height: 150px;
      position: relative;
    }
    .chart-svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .line-path, .area-path {
      transition: d 0.3s ease;
    }
    .chart-tooltip {
        position: absolute;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        pointer-events: none;
        z-index: 100;
        min-width: 120px;
        transform: translate(10px, -50%);
    }
    .tooltip-time {
        font-weight: 700;
        color: #374151;
        margin-bottom: 8px;
        font-size: 0.85rem;
    }
    .tooltip-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.8rem;
        margin-bottom: 4px;
    }
    .row-label { font-weight: 500; }
    .row-value { font-weight: 600; color: #1f2937; }
  `]
})
export class LineChartComponent implements OnChanges, AfterViewInit {
  @Input() series: ChartSeries[] = [];
  @Input() labels: string[] = [];
  @Input() showAxes: boolean = true;
  @Input() height: number = 200;
  @Input() minY?: number;
  @Input() maxY?: number;

  // Legacy support for single series
  @Input() data: number[] = [];
  @Input() color: string = '#10b981';
  @Input() label: string = 'Value';

  @ViewChild('svgRef') svgRef!: ElementRef<SVGElement>;

  width: number = 600;
  padding: number = 30;
  labelStep: number = 3;

  viewBox: string = `0 0 ${this.width} ${this.height}`;
  gradientId: string = 'chartGrad-' + Math.random().toString(36).substr(2, 5);

  computedSeries: any[] = [];
  points: { x: number, y: number }[] = [];
  yTicks: number[] = [];

  hoverIndex: number | null = null;
  tooltipPos = { x: 0, y: 0 };

  constructor(private el: ElementRef) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['series'] || changes['labels'] || changes['data'] || changes['minY'] || changes['maxY']) {
      this.handleLegacyData();
      this.drawChart();
    }
  }

  private handleLegacyData() {
    if (this.data.length && !this.series.length) {
      this.series = [{
        name: this.label,
        data: this.data,
        color: this.color,
        unit: ''
      }];
    }
  }

  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private setupResizeObserver() {
    const element = this.el.nativeElement.querySelector('.chart-container');
    if (!element) return;

    this.resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0) {
          this.width = entry.contentRect.width;
          this.height = entry.contentRect.height || this.height;
          this.viewBox = `0 0 ${this.width} ${this.height}`;
          this.drawChart();
        }
      }
    });

    this.resizeObserver.observe(element);
  }

  // Fallback for manual calls if needed
  onResize() { }

  getY(value: number): number {
    const allData = this.series.flatMap(s => s.data);
    let min = this.minY !== undefined ? this.minY : Math.min(...allData) * 0.9;
    let max = this.maxY !== undefined ? this.maxY : Math.max(...allData) * 1.1;

    // Fallback if auto-scale is flat
    if (min === max) {
      min -= 1;
      max += 1;
    }

    const range = max - min || 1;
    return this.height - this.padding - ((value - min) / range) * (this.height - 2 * this.padding);
  }

  onMouseMove(event: MouseEvent) {
    if (!this.points.length) return;

    const rect = this.svgRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Find closest point by X
    const stepX = (this.width - 2 * this.padding) / (this.labels.length - 1);
    let index = Math.round((x - this.padding) / stepX);
    index = Math.max(0, Math.min(this.labels.length - 1, index));

    this.hoverIndex = index;
    this.tooltipPos = { x: this.points[index].x, y: y };

    // Flip tooltip if near right edge
    if (this.tooltipPos.x > this.width - 150) {
      this.tooltipPos.x -= 160;
    }
  }

  onMouseLeave() {
    this.hoverIndex = null;
  }

  drawChart() {
    if (!this.series.length || !this.series[0].data.length) return;

    // Calculate label step dynamically based on current width
    // Use 45px per label estimate for better density on small charts
    const maxLabels = Math.floor(this.width / 45);
    this.labelStep = Math.ceil(this.labels.length / maxLabels) || 1;

    const dataLen = this.series[0].data.length;
    const stepX = (this.width - 2 * this.padding) / (dataLen - 1);

    this.points = Array.from({ length: dataLen }, (_, i) => ({
      x: this.padding + i * stepX,
      y: 0 // placeholder
    }));

    const allData = this.series.flatMap(s => s.data);
    let min = this.minY !== undefined ? this.minY : Math.min(...allData);
    let max = this.maxY !== undefined ? this.maxY : Math.max(...allData);

    // Ensure we respect auto-scale padding logic if inputs are not strict (or maybe loose it for simplicity)
    if (this.minY === undefined) min *= 0.9;
    if (this.maxY === undefined) max *= 1.1;

    const range = max - min || 1;

    // Generate 5 ticks
    this.yTicks = Array.from({ length: 5 }, (_, i) =>
      Math.round(min + (range * i) / 4)
    );

    this.computedSeries = this.series.map(s => {
      const points = s.data.map((val, i) => ({
        x: this.padding + i * stepX,
        y: this.getY(val)
      }));

      let linePath = `M ${points[0].x} ${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const cp1x = p0.x + (p1.x - p0.x) / 3;
        const cp1y = p0.y;
        const cp2x = p1.x - (p1.x - p0.x) / 3;
        const cp2y = p1.y;
        linePath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
      }

      const areaPath = `${linePath} L ${points[points.length - 1].x} ${this.height - this.padding} L ${points[0].x} ${this.height - this.padding} Z`;

      return { ...s, points, linePath, areaPath };
    });
  }
}

