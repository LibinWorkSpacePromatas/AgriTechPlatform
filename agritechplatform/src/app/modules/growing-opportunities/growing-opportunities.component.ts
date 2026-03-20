import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Sprout, ChevronRight, X, ExternalLink } from 'lucide-angular';
import { Subject, distinctUntilChanged, filter, takeUntil } from 'rxjs';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import {
    GrowingOpportunitiesService,
    OpportunitiesResponse,
    SatelliteOpportunity
} from '../../services/growing-opportunities/growing-opportunities.service';

@Component({
    selector: 'app-growing-opportunities',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    templateUrl: './growing-opportunities.component.html',
    styleUrls: ['./growing-opportunities.component.css']
})
export class GrowingOpportunitiesComponent implements OnInit, OnDestroy {
    SproutIcon = Sprout;
    ChevronRightIcon = ChevronRight;
    XIcon = X;
    ExternalLinkIcon = ExternalLink;

    private readonly destroy$ = new Subject<void>();

    selectedOpportunity: SatelliteOpportunity | null = null;
    currentBlock: Block | null = null;
    opportunitiesResponse: OpportunitiesResponse | null = null;
    opportunities: SatelliteOpportunity[] = [];
    isLoading = false;
    errorMessage: string | null = null;

    constructor(
        private blockService: BlockService,
        private growingOpportunitiesService: GrowingOpportunitiesService
    ) {}

    ngOnInit() {
        this.blockService.block$
            .pipe(
                takeUntil(this.destroy$),
                filter((block): block is Block => !!block),
                distinctUntilChanged((previous, current) => previous.lan === current.lan)
            )
            .subscribe(block => {
                this.currentBlock = block;
                this.loadOpportunities(block);
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    openOpportunity(opportunity: SatelliteOpportunity): void {
        this.selectedOpportunity = opportunity;
        document.body.classList.add('scroll-lock');
    }

    closeOpportunity(): void {
        this.selectedOpportunity = null;
        document.body.classList.remove('scroll-lock');
    }

    private loadOpportunities(block: Block): void {
        this.isLoading = true;
        this.errorMessage = null;

        this.growingOpportunitiesService.getOpportunities(block.lan || block.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: response => {
                    this.opportunitiesResponse = response;
                    this.opportunities = response.opportunities;
                    this.errorMessage = response.warning;
                    this.isLoading = false;
                },
                error: error => {
                    console.error('Growing opportunities request failed.', error);
                    this.opportunitiesResponse = null;
                    this.opportunities = [];
                    this.errorMessage = 'Unable to load NDRE/EVI-driven opportunities for this block.';
                    this.isLoading = false;
                }
            });
    }
}
