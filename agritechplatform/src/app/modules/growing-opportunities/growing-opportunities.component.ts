import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, Subscription, takeUntil, distinctUntilChanged, filter } from 'rxjs';
import { LucideAngularModule, Sprout, ChevronRight, X, ExternalLink, AlertTriangle, Droplets, Leaf, Layers, CheckCircle2, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-angular';
import { UserDataService } from '../../core/services/user-data.service';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/user.model';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import {
    GrowingOpportunitiesService,
    GrowingOpportunitiesResponse,
    GrowingOpportunityRecommendation
} from '../../core/services/growing-opportunities.service';

interface Opportunity {
    id: string;
    title: string;
    description: string;
    fullDescription: string;
    keyPoints: string[];
    tags: string[];
    source: string;
    sourceUrl: string;
}

interface LiveMetricCard {
    key: 'ndvi' | 'ndwi' | 'evi' | 'ndre' | 'lai';
    shortLabel: string;
    title: string;
    description: string;
    value: number | null;
}

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
    AlertTriangleIcon = AlertTriangle;
    DropletsIcon = Droplets;
    LeafIcon = Leaf;
    LayersIcon = Layers;
    CheckCircleIcon = CheckCircle2;
    RefreshCwIcon = RefreshCw;
    ThumbsUpIcon = ThumbsUp;
    ThumbsDownIcon = ThumbsDown;

    private readonly destroy$ = new Subject<void>();
    private insightsRequest?: Subscription;
    private feedbackRequest?: Subscription;

    selectedOpportunity: Opportunity | null = null;
    user: User | undefined;
    currentBlock: Block | null = null;
    pageData: GrowingOpportunitiesResponse | null = null;
    isInsightsLoading = false;
    pageWarning: string | null = null;
    feedbackMessage: string | null = null;
    feedbackState: Record<string, 'helpful' | 'not_helpful' | 'saving'> = {};

    opportunities: Opportunity[] = [
        {
            id: 'olives-lower-water',
            title: 'Olives: A Lower-Water Option for Riverland',
            description: 'Olive cultivation offers Riverland growers a drought-tolerant alternative that thrives in the region\'s warm Mediterranean climate. With water requirements 30-40% lower than wine grapes, olives present an attractive option for growers...',
            fullDescription: 'Olive cultivation offers Riverland growers a drought-tolerant alternative that thrives in the region\'s warm Mediterranean climate. With water requirements 30-40% lower than wine grapes, olives present an attractive option for growers facing water allocation pressures. The trees are also saline-tolerant, making them suitable for areas with marginally brackish irrigation water.',
            keyPoints: [
                'Water use 30-40% lower than grapes',
                'Saline-tolerant varieties available',
                'Mechanised harvesting reduces labour costs',
                'Rising demand for Australian olive oil',
                'Establishment costs recovered within 5-7 years'
            ],
            tags: ['olives', 'diversification', 'water-efficiency'],
            source: 'Primary Industries SA',
            sourceUrl: 'https://pir.sa.gov.au'
        },
        {
            id: 'government-funding',
            title: 'Government Funding to Support Diversification',
            description: 'The South Australian Government and Central Cooperative Winery (CCW) have announced funding initiatives to help Riverland grape growers transition to more from low-value red grape varieties. Grants of up to $50,000 are available for...',
            fullDescription: 'The South Australian Government and Central Cooperative Winery (CCW) have announced funding initiatives to help Riverland grape growers transition away from low-value red grape varieties. Grants of up to $50,000 are available for growers to replant with alternative crops or premium varieties, with additional support for business planning and market research.',
            keyPoints: [
                'Grants up to $50,000 for crop transition',
                'Business planning support available',
                'Market research assistance included',
                'CCW offering vine removal rebates',
                'Applications open until June 2026'
            ],
            tags: ['funding', 'government-support', 'grants'],
            source: 'Government of South Australia',
            sourceUrl: 'https://www.sa.gov.au/topics/business-and-trade/industry-support'
        },
        {
            id: 'alternative-varieties',
            title: 'Alternative Varieties & Premium Markets',
            description: 'Mediterranean grape varieties like Nero d\'Avola, Fiano, and Vermentino are gaining traction in the Riverland, offering growers access to premium markets with being better adapted to warming conditions. These varieties typically...',
            fullDescription: 'Mediterranean grape varieties like Nero d\'Avola, Fiano, and Vermentino are gaining traction in the Riverland, offering growers access to premium markets while being better adapted to warming conditions. These varieties typically command prices 2-3 times higher than bulk Shiraz and have shown strong resilience to heat stress events.',
            keyPoints: [
                'Premium varieties command higher prices',
                'Better adapted to warming climate',
                'Growing consumer interest in alternative varieties',
                'Reduced water stress tolerance',
                'Organic certification opportunities'
            ],
            tags: ['premium-varieties', 'alternative-grapes', 'organic'],
            source: 'Wine Australia',
            sourceUrl: 'https://www.wineaustralia.com/market-insights'
        },
        {
            id: 'almonds-precision-irrigation',
            title: 'Almonds & Precision Irrigation for Drought Resilience',
            description: 'SARDI and the SA Drought Hub have been researching precision irrigation techniques that match water application to actual canopy requirements. For almond growers, this approach has shown 15-20% water savings without yield...',
            fullDescription: 'SARDI and the SA Drought Hub have been researching precision irrigation techniques that match water application to actual canopy requirements. For almond growers, this approach has shown 15-20% water savings without yield reduction. The research also explores deficit irrigation strategies for existing grape blocks during water-scarce years.',
            keyPoints: [
                '15-20% water savings demonstrated',
                'Canopy-matched irrigation techniques',
                'Deficit irrigation strategies for grapes',
                'Soil moisture monitoring integration',
                'Real-time decision support tools'
            ],
            tags: ['almonds', 'precision-irrigation', 'drought-resilience'],
            source: 'SARDI',
            sourceUrl: 'https://pir.sa.gov.au/sardi'
        },
        {
            id: 'multi-crop-strategies',
            title: 'Multi-Crop Strategies Amid Oversupply',
            description: 'Several successful Riverland growers have diversified their operations to include multiple crop types, reducing their exposure to single commodity price fluctuations. Examples include combining citrus with wine grapes, or adding oil...',
            fullDescription: 'Several successful Riverland growers have diversified their operations to include multiple crop types, reducing their exposure to single-commodity price fluctuations. Examples include combining citrus with wine grapes, or adding olive groves to existing vineyard operations. This approach provides multiple income streams and spreads risk across different market cycles.',
            keyPoints: [
                'Multiple income streams reduce risk',
                'Spread workload across seasons',
                'Better utilization of infrastructure',
                'Access to diverse export markets',
                'Enhanced biodiversity and soil health'
            ],
            tags: ['diversification', 'risk-management', 'export-markets'],
            source: 'AgriFutures Australia',
            sourceUrl: 'https://agrifutures.com.au'
        }
    ];

    constructor(
        private userDataService: UserDataService,
        private authService: AuthService,
        private blockService: BlockService,
        private growingOpportunitiesService: GrowingOpportunitiesService
    ) {}

    ngOnInit() {
        this.user = this.authService.getCurrentUser() || this.userDataService.getUsers()[0];

        this.blockService.block$
            .pipe(
                takeUntil(this.destroy$),
                filter((block): block is Block => !!block),
                distinctUntilChanged((previous, current) => previous.lan === current.lan)
            )
            .subscribe(block => {
                this.currentBlock = block;
                this.loadBlockInsights(block);
            });
    }

    ngOnDestroy(): void {
        this.insightsRequest?.unsubscribe();
        this.feedbackRequest?.unsubscribe();
        document.body.classList.remove('scroll-lock');
        this.destroy$.next();
        this.destroy$.complete();
    }

    openOpportunity(opportunity: Opportunity): void {
        this.selectedOpportunity = opportunity;
        document.body.classList.add('scroll-lock');
    }

    closeOpportunity(): void {
        this.selectedOpportunity = null;
        document.body.classList.remove('scroll-lock');
    }

    get insightsStatusLabel(): string {
        if (this.isInsightsLoading) {
            return 'Loading live block intelligence';
        }

        if (!this.pageData) {
            return 'Waiting for block intelligence';
        }

        if (this.pageData.status === 'updating') {
            return 'Background refresh in progress';
        }

        if (this.pageData.status === 'stale') {
            return 'Showing stale cache while refresh runs';
        }

        return 'Fresh satellite composite available';
    }

    get freshnessLabel(): string {
        if (!this.pageData?.composite_date_to) {
            return 'Composite date unavailable';
        }

        const ageSuffix = this.pageData.data_age_days !== null
            ? ` (${this.pageData.data_age_days} day${this.pageData.data_age_days === 1 ? '' : 's'} old)`
            : '';
        return `Composite date: ${this.formatDate(this.pageData.composite_date_to)}${ageSuffix}`;
    }

    get qualityLabel(): string {
        if (!this.pageData) {
            return 'Quality unknown';
        }

        return `Data quality: ${this.pageData.data_quality.replace('_', ' ')}`;
    }

    get confidenceLabel(): string {
        if (!this.pageData) {
            return 'Confidence: unknown';
        }

        return `Confidence: ${this.pageData.confidence}`;
    }

    get cloudCoverLabel(): string {
        if (this.pageData?.cloud_cover_pct === null || this.pageData?.cloud_cover_pct === undefined) {
            return 'Cloud cover: unavailable';
        }

        return `Cloud cover: ${this.pageData.cloud_cover_pct.toFixed(0)}%`;
    }

    get pixelCountLabel(): string {
        if (!this.pageData) {
            return 'Valid pixels: unknown';
        }

        return `Valid pixels: ${this.pageData.pixel_count}`;
    }

    get searchWindowLabel(): string {
        if (!this.pageData?.search_window_from || !this.pageData?.search_window_to) {
            return 'Search window unavailable';
        }

        return `Search window: ${this.formatDate(this.pageData.search_window_from)} to ${this.formatDate(this.pageData.search_window_to)}`;
    }

    get liveMetricCards(): LiveMetricCard[] {
        return [
            {
                key: 'ndvi',
                shortLabel: 'Plant health',
                title: 'Overall vine health',
                description: 'Shows how healthy and active the canopy looks overall.',
                value: this.pageData?.ndvi ?? null
            },
            {
                key: 'ndwi',
                shortLabel: 'Water stress',
                title: 'Water pressure',
                description: 'Shows whether vines may be drying down and needing irrigation soon.',
                value: this.pageData?.ndwi ?? null
            },
            {
                key: 'evi',
                shortLabel: 'Canopy growth',
                title: 'Canopy density',
                description: 'Shows how full or dense the canopy is across the block.',
                value: this.pageData?.evi ?? null
            },
            {
                key: 'ndre',
                shortLabel: 'Nutrient signal',
                title: 'Leaf nutrient activity',
                description: 'Shows whether chlorophyll activity suggests nutrient weakness.',
                value: this.pageData?.ndre ?? null
            },
            {
                key: 'lai',
                shortLabel: 'Leaf volume',
                title: 'Leaf area level',
                description: 'Shows how much leaf area is present, which helps indicate canopy size.',
                value: this.pageData?.lai ?? null
            }
        ];
    }

    get hasLiveAlerts(): boolean {
        return (this.pageData?.recommendations || []).some(recommendation => recommendation.category !== 'system');
    }

    get primaryRecommendation(): GrowingOpportunityRecommendation | null {
        return this.liveRecommendations[0] || null;
    }

    get liveRecommendations(): GrowingOpportunityRecommendation[] {
        return this.pageData?.recommendations || [];
    }

    get pageHeadline(): string {
        if (this.isInsightsLoading) {
            return 'Checking the latest conditions for this block';
        }

        if (!this.primaryRecommendation) {
            return 'No live recommendation available yet';
        }

        if (this.primaryRecommendation.severity === 'critical') {
            return 'Immediate attention recommended';
        }

        if (this.primaryRecommendation.severity === 'warning') {
            return 'A block-level action is worth planning now';
        }

        if (this.primaryRecommendation.severity === 'positive') {
            return 'This block looks stable right now';
        }

        return 'A management opportunity has been detected';
    }

    get pageSummary(): string {
        if (!this.currentBlock) {
            return 'Select a block to see the next recommended action.';
        }

        if (this.isInsightsLoading) {
            return `We are loading the latest recommendation set for ${this.currentBlock.name}.`;
        }

        if (this.primaryRecommendation) {
            return this.withFriendlyBlockName(this.primaryRecommendation.message_to_farmer);
        }

        return `We do not have a live recommendation ready for ${this.currentBlock.name} yet.`;
    }

    trackByRecommendation(_: number, recommendation: GrowingOpportunityRecommendation): string {
        return recommendation.id;
    }

    trackByOpportunity(_: number, opportunity: Opportunity): string {
        return opportunity.id;
    }

    getRecommendationIcon(recommendation: GrowingOpportunityRecommendation): any {
        if (recommendation.metric_key === 'ndwi') {
            return this.DropletsIcon;
        }

        if (recommendation.metric_key === 'ndre') {
            return this.LayersIcon;
        }

        if (recommendation.metric_key === 'evi') {
            return this.LeafIcon;
        }

        if (recommendation.severity === 'positive') {
            return this.CheckCircleIcon;
        }

        return this.AlertTriangleIcon;
    }

    getSeverityLabel(recommendation: GrowingOpportunityRecommendation): string {
        if (recommendation.severity === 'critical') {
            return 'Urgent';
        }

        if (recommendation.severity === 'warning') {
            return 'Action soon';
        }

        if (recommendation.severity === 'positive') {
            return 'Stable';
        }

        return 'Watch';
    }

    getPlainMetricLabel(recommendation: GrowingOpportunityRecommendation): string {
        if (recommendation.metric_key === 'ndre') {
            return 'Leaf nutrient signal';
        }

        if (recommendation.metric_key === 'evi') {
            return 'Canopy growth signal';
        }

        if (recommendation.metric_key === 'ndwi') {
            return 'Water stress signal';
        }

        if (recommendation.metric_key === 'system') {
            return 'Block status';
        }

        return recommendation.metric_label;
    }

    withFriendlyBlockName(text: string | null | undefined): string {
        if (!text) {
            return '';
        }

        if (!this.currentBlock) {
            return text;
        }

        let nextText = text;

        if (this.currentBlock.lan) {
            nextText = nextText.split(this.currentBlock.lan).join(this.currentBlock.name);
        }

        if (this.currentBlock.id) {
            nextText = nextText.split(this.currentBlock.id).join(this.currentBlock.name);
        }

        return nextText;
    }

    formatRecommendationValue(value: number | string | null): string {
        if (value === null || value === undefined || value === '') {
            return 'N/A';
        }

        if (typeof value === 'number') {
            return value.toFixed(2);
        }

        return value;
    }

    isFeedbackSelected(recommendationId: string, choice: 'helpful' | 'not_helpful'): boolean {
        return this.feedbackState[recommendationId] === choice;
    }

    submitFeedback(recommendation: GrowingOpportunityRecommendation, helpful: boolean): void {
        if (!this.currentBlock || !this.pageData?.feedback_enabled) {
            return;
        }

        const nextState = helpful ? 'helpful' : 'not_helpful';
        this.feedbackState[recommendation.id] = 'saving';
        this.feedbackMessage = null;
        this.feedbackRequest?.unsubscribe();

        this.feedbackRequest = this.growingOpportunitiesService
            .sendFeedback(this.currentBlock.lan || this.currentBlock.id, {
                recommendation_id: recommendation.id,
                helpful
            })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: () => {
                    this.feedbackState[recommendation.id] = nextState;
                    this.feedbackMessage = 'Feedback saved for calibration.';
                },
                error: error => {
                    console.error('Failed to save Growing Opportunities feedback.', error);
                    delete this.feedbackState[recommendation.id];
                    this.feedbackMessage = 'Feedback could not be saved right now.';
                }
            });
    }

    private loadBlockInsights(block: Block): void {
        this.isInsightsLoading = true;
        this.pageWarning = null;
        this.feedbackMessage = null;
        this.pageData = null;
        this.feedbackState = {};
        this.insightsRequest?.unsubscribe();

        this.insightsRequest = this.growingOpportunitiesService.getPageData(block.lan || block.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: pageData => {
                    this.pageData = pageData;
                    this.pageWarning = pageData.warning;
                    this.isInsightsLoading = false;
                },
                error: error => {
                    console.error('Growing Opportunities insights request failed.', error);
                    this.pageData = null;
                    this.pageWarning = 'Unable to load live satellite opportunities for the selected block.';
                    this.isInsightsLoading = false;
                }
            });
    }

    private formatDate(value: string): string {
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

}
