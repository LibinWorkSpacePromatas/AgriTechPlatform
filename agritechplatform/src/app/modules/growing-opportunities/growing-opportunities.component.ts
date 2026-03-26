import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, Subscription, takeUntil, distinctUntilChanged, filter } from 'rxjs';
import { LucideAngularModule, Sprout, ChevronRight, X, ExternalLink, AlertTriangle, Droplets, Leaf, Layers, CheckCircle2, RefreshCw, ThumbsUp, ThumbsDown, Info } from 'lucide-angular';
import { UserDataService } from '../../core/services/user-data.service';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../core/models/user.model';
import { BlockService } from '../../shared/services/block.service';
import { Block } from '../../shared/models';
import {
    GrowingOpportunitiesService,
    GrowingOpportunityNewsItem,
    GrowingOpportunitiesResponse,
    GrowingOpportunityRecommendation
} from '../../core/services/growing-opportunities.service';

interface OpportunityArticle {
    id: string;
    title: string;
    description: string;
    fullDescription: string;
    tags: string[];
    source: string;
    sourceUrl: string;
    publishedAt: string | null;
    region: string;
    category: 'funding' | 'tools' | 'help' | 'general';
}

interface LiveMetricCard {
    key: 'ndvi' | 'ndwi' | 'evi' | 'ndre' | 'lai';
    shortLabel: string;
    title: string;
    description: string;
    value: number | null;
}

type GrowingOpportunitiesTab = 'recommendations' | 'updates';
type NewsFilter = 'all' | 'funding' | 'tools' | 'help' | 'general';

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
    InfoIcon = Info;

    private readonly destroy$ = new Subject<void>();
    private insightsRequest?: Subscription;
    private feedbackRequest?: Subscription;

    selectedOpportunity: OpportunityArticle | null = null;
    user: User | undefined;
    currentBlock: Block | null = null;
    pageData: GrowingOpportunitiesResponse | null = null;
    isInsightsLoading = false;
    pageWarning: string | null = null;
    feedbackMessage: string | null = null;
    feedbackState: Record<string, 'helpful' | 'not_helpful' | 'saving'> = {};
    activeTab: GrowingOpportunitiesTab = 'recommendations';
    activeNewsFilter: NewsFilter = 'all';

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

    openOpportunity(opportunity: OpportunityArticle): void {
        this.selectedOpportunity = opportunity;
        document.body.classList.add('scroll-lock');
    }

    closeOpportunity(): void {
        this.selectedOpportunity = null;
        document.body.classList.remove('scroll-lock');
    }

    setActiveTab(tab: GrowingOpportunitiesTab): void {
        this.activeTab = tab;
    }

    setActiveNewsFilter(filter: NewsFilter): void {
        this.activeNewsFilter = filter;
    }

    isNewsFilterActive(filter: NewsFilter): boolean {
        return this.activeNewsFilter === filter;
    }

    getNewsFilterCount(filter: NewsFilter): number {
        if (filter === 'all') {
            return this.newsItems.length;
        }

        return this.newsItems.filter(item => item.category === filter).length;
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

    get liveMetricsCommandLine(): string {
        return this.liveMetricCards
            .map(metric => `${metric.key.toUpperCase()}: ${this.formatRecommendationValue(metric.value)} (${metric.shortLabel})`)
            .join(' | ');
    }

    get primaryRecommendation(): GrowingOpportunityRecommendation | null {
        return this.liveRecommendations[0] || null;
    }

    get liveRecommendations(): GrowingOpportunityRecommendation[] {
        return this.pageData?.recommendations || [];
    }

    get newsItems(): OpportunityArticle[] {
        return (this.pageData?.news_items || []).map(item => this.toOpportunityArticle(item));
    }

    get filteredNewsItems(): OpportunityArticle[] {
        if (this.activeNewsFilter === 'all') {
            return this.newsItems;
        }

        return this.newsItems.filter(item => item.category === this.activeNewsFilter);
    }

    get newsWarning(): string | null {
        return this.pageData?.news_warning || null;
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

    trackByOpportunity(_: number, opportunity: OpportunityArticle): string {
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

    getReadingStatusLabel(recommendation: GrowingOpportunityRecommendation): string {
        const value = typeof recommendation.current_value === 'number'
            ? recommendation.current_value
            : Number(recommendation.current_value);

        if (recommendation.metric_key === 'ndwi') {
            if (!Number.isFinite(value)) {
                return 'Water status unavailable';
            }
            if (value < -0.30) {
                return 'Severe water stress';
            }
            if (value < -0.10) {
                return 'Water stress building';
            }
            if (value <= 0.10) {
                return 'Mild water stress';
            }
            return 'Well watered';
        }

        if (recommendation.metric_key === 'ndre') {
            if (!Number.isFinite(value)) {
                return 'Nutrient signal unavailable';
            }
            if (value < 0.25) {
                return 'Low nutrient activity';
            }
            if (value <= 0.40) {
                return 'Moderate nutrient activity';
            }
            return 'Strong nutrient activity';
        }

        if (recommendation.metric_key === 'evi') {
            if (!Number.isFinite(value)) {
                return 'Canopy signal unavailable';
            }
            if (value > 0.50) {
                return 'Dense canopy';
            }
            if (value >= 0.30) {
                return 'Balanced canopy growth';
            }
            return 'Light canopy growth';
        }

        return typeof recommendation.current_value === 'string'
            ? recommendation.current_value
            : 'Reading available';
    }

    getReadingMeaningTooltip(recommendation: GrowingOpportunityRecommendation): string[] {
        if (recommendation.metric_key === 'ndwi') {
            return [
                'Above 0.10: vines are holding water well.',
                '-0.10 to 0.10: mild stress, keep watching.',
                '-0.30 to -0.10: stress is building, irrigation may be needed soon.',
                'Below -0.30: severe water stress, act urgently.'
            ];
        }

        if (recommendation.metric_key === 'ndre') {
            return [
                'Above 0.40: strong chlorophyll and nutrient activity.',
                '0.25 to 0.40: moderate nutrient activity.',
                'Below 0.25: likely nutrient weakness, inspect the block.',
                'A falling trend makes low values more concerning.'
            ];
        }

        if (recommendation.metric_key === 'evi') {
            return [
                'Above 0.50: canopy is dense, airflow may be tighter.',
                '0.30 to 0.50: balanced canopy growth.',
                'Below 0.30: lighter canopy or weaker vegetative growth.',
                'Use this together with disease and vigor observations.'
            ];
        }

        return [
            'This reading is interpreted using the rule on the left.',
            'Lower or higher values change the recommendation depending on the metric.'
        ];
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

    formatNewsDate(value: string | null): string {
        if (!value) {
            return 'Date unavailable';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleDateString('en-AU', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
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

    private toOpportunityArticle(item: GrowingOpportunityNewsItem): OpportunityArticle {
        return {
            id: item.id,
            title: item.title,
            description: item.summary,
            fullDescription: item.summary,
            tags: item.tags,
            source: item.source,
            sourceUrl: item.source_url,
            publishedAt: item.published_at,
            region: item.region,
            category: this.normalizeNewsCategory(item.category)
        };
    }

    private normalizeNewsCategory(value: string): OpportunityArticle['category'] {
        if (value === 'funding' || value === 'tools' || value === 'help' || value === 'general') {
            return value;
        }

        return 'general';
    }

}
