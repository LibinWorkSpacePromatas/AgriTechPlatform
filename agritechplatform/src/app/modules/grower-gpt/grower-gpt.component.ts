import { Component, OnDestroy, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdelaideTimePipe } from '../../shared/pipes/adelaide-time.pipe';
import { LucideAngularModule, MessageCircle, Zap, Maximize2, Bot, Send, Sparkles } from 'lucide-angular';
import { GrowerGptBlockSummary, GrowerGptService } from '../../services/grower-gpt/grower-gpt.service';
import { BlockService } from '../../shared/services/block.service';
import { UserDataService } from '../../core/services/user-data.service';
import { AuthService } from '../../core/services/auth.service';
import { Subject, distinctUntilChanged, filter, lastValueFrom, take, takeUntil } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Block } from '../../shared/models';

@Component({
  selector: 'app-grower-gpt',
  standalone: true,
  imports: [CommonModule, FormsModule, AdelaideTimePipe, LucideAngularModule],
  templateUrl: './grower-gpt.component.html',
  styleUrls: ['./grower-gpt.component.css']
})
export class GrowerGptComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  private readonly destroy$ = new Subject<void>();
  private lastRenderedMessageCount = 0;

  BotIcon = Bot;
  SendIcon = Send;
  SparklesIcon = Sparkles;
  MessageIcon = MessageCircle;
  ZapIcon = Zap;

  userMessage: string = '';
  chatHistory: { role: 'user' | 'assistant', content: string }[] = [];
  isLoading: boolean = false;
  blockSummary: GrowerGptBlockSummary | null = null;
  recommendedQuestions: string[] = [
    "What is the irrigation plan for this week?",
    "Which satellite signals are most urgent right now?",
    "What does my NDWI mean and what should I do?",
    "What do NDVI/NDRE changes mean for vine health?"
  ];

  constructor(
    public growerGptService: GrowerGptService,
    public blockService: BlockService,
    private userDataService: UserDataService,
    private authService: AuthService,
    private sanitizer: DomSanitizer
  ) { }

  getSelectedBlockName(): string {
    return this.blockService.getSelectedBlock()?.name || 'Unknown Block';
  }

  getSelectedBlockCrop(): string {
    const block = this.blockService.getSelectedBlock();
    const crop = block?.crop || '';
    const name = block?.name || '';
    if (!crop) {
      return '';
    }
    if (name.toLowerCase().includes(crop.toLowerCase())) {
      return '';
    }
    return crop;
  }

  formatMetric(value: number | null | undefined, digits: string = '1.0-1', unit: string = ''): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    const maxDigits = digits.includes('-') ? Number(digits.split('-')[1]) : 1;
    const minDigits = digits.includes('.') ? Number(digits.split('.')[1].split('-')[0]) : 0;
    const formatted = new Intl.NumberFormat('en-AU', {
      minimumFractionDigits: Number.isNaN(minDigits) ? 0 : minDigits,
      maximumFractionDigits: Number.isNaN(maxDigits) ? 1 : maxDigits
    }).format(value);
    if (!formatted || formatted === 'NaN') {
      return 'N/A';
    }
    return unit ? `${formatted} ${unit}` : formatted;
  }

  hasUserMessages(): boolean {
    return this.chatHistory.some(message => message.role === 'user');
  }

  renderMarkdown(content: string): SafeHtml {
    const renderer = new marked.Renderer();

    // Fix for TS2322: marked v11+ uses a single 'token' argument for renderers
    renderer.table = (token: any) => {
      const header = token.header.map((cell: any) => `<th>${cell.text}</th>`).join('');
      const body = token.rows.map((row: any) => {
        return `<tr>${row.map((cell: any) => `<td>${cell.text}</td>`).join('')}</tr>`;
      }).join('');
      return `<div class="table-container"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
    };

    // Pre-process to handle LaTeX-like blocks if any
    let processedContent = content;
    processedContent = processedContent.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
      return `<div class="math-block">${formula}</div>`;
    });

    const rawHtml = marked.parse(processedContent, { renderer }) as string;
    const cleanHtml = DOMPurify.sanitize(rawHtml);
    return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
  }

  ngOnInit() {
    this.blockService.block$
      .pipe(
        takeUntil(this.destroy$),
        filter((block): block is Block => !!block),
        distinctUntilChanged((previous, current) => previous.lan === current.lan)
      )
      .subscribe(block => {
        this.loadBlockSummary(block);
      });
  }

  ngAfterViewChecked() {
    if (this.chatHistory.length === this.lastRenderedMessageCount) {
      return;
    }
    if (this.hasUserMessages()) {
      this.scrollToBottom();
    } else {
      this.scrollToTop();
    }
    this.lastRenderedMessageCount = this.chatHistory.length;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private scrollToBottom(): void {
    try {
      const element = this.chatContainer.nativeElement.querySelector('.messages-viewport') || this.chatContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    } catch (err) { }
  }

  private scrollToTop(): void {
    try {
      const element = this.chatContainer.nativeElement.querySelector('.messages-viewport') || this.chatContainer.nativeElement;
      element.scrollTop = 0;
    } catch (err) { }
  }

  async retryLastMessage() {
    const lastUserMessage = [...this.chatHistory].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      // Remove the error message from history
      this.chatHistory = this.chatHistory.filter(m => !m.content.includes('error connecting') && !m.content.includes('Rate Limited') && !m.content.includes('handling too many requests'));
      await this.sendMessage(lastUserMessage.content);
    }
  }

  async sendMessage(customMessage?: string) {
    const messageToSend = customMessage || this.userMessage;
    if (!messageToSend.trim() || this.isLoading) return;

    const message = messageToSend;
    this.chatHistory.push({ role: 'user', content: message });
    if (!customMessage) this.userMessage = '';
    this.isLoading = true;

    try {
      const selectedUser = this.authService.getCurrentUser() || this.userDataService.getUsers()[0];
      const currentBlock = this.blockService.getSelectedBlock();

      // STEP 1 — Detect Block Automatically
      // Check if user mentioned a specific block in their message
      let targetBlock = currentBlock;
      let blockLabel = currentBlock.name;

      if (selectedUser) {
        const mentionedBlock = selectedUser.blocks.find((b, index) => {
          const nameMatch = message.toLowerCase().includes(b.lanslu.toLowerCase());
          const indexMatch = message.toLowerCase().includes(`block ${index + 1}`); // Matches "Block 1", "Block 2", etc.
          const cropMatch = b.crop ? message.toLowerCase().includes(b.crop.toLowerCase()) : false;
          return nameMatch || indexMatch || cropMatch;
        });

        if (mentionedBlock) {
          targetBlock = {
            ...currentBlock,
            id: mentionedBlock.lanslu,
            name: `Block ${selectedUser.blocks.indexOf(mentionedBlock) + 1}`,
            crop: mentionedBlock.crop || 'Unknown Crop',
            lat: mentionedBlock.latitude,
            lon: mentionedBlock.longitude,
            lan: mentionedBlock.lanslu,
            // Ensure full block data is included for the AI
            ...mentionedBlock,
            latitude: mentionedBlock.latitude, // Overwrite to match Block interface
            longitude: mentionedBlock.longitude
          } as any;
          blockLabel = targetBlock.name;
        }
      }

      let targetSummary = this.blockSummary;
      if (targetBlock.lan !== currentBlock.lan || !targetSummary) {
        targetSummary = await lastValueFrom(this.growerGptService.getRuleBasedInsights(targetBlock.lan || targetBlock.id));
      }

      const reply = await this.growerGptService.askGrowerGPT(
        targetBlock,
        selectedUser,
        targetSummary,
        message,
        blockLabel
      );

      this.chatHistory.push({ role: 'assistant', content: reply });
    } catch (error: any) {
      console.error('Grower GPT Error:', error);
      let errorMessage = 'I apologize, but I encountered an error connecting to the agronomic engine. Please try again later.';

      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        errorMessage = 'Authentication Error: The AI service API key appears to be invalid or expired. Please contact support or check your configuration.';
      } else if (error.message?.includes('Rate Limited') || error.message?.includes('429')) {
        errorMessage = 'The AI service is currently busy or handling too many requests. Please wait a moment and click "Retry Connection".';
      }

      this.chatHistory.push({
        role: 'assistant',
        content: errorMessage
      });
    } finally {
      this.isLoading = false;
    }
  }

  private loadBlockSummary(block: Block): void {
    this.blockSummary = null;
    this.chatHistory = [];
    this.lastRenderedMessageCount = 0;

    this.growerGptService.getRuleBasedInsights(block.id || block.lan)
      .pipe(take(1))
      .subscribe({
        next: (backendData) => {
          this.blockSummary = backendData;
          if (backendData.insights && backendData.insights.length > 0) {
            this.chatHistory.push({
              role: 'assistant',
              content: `Hello! I've performed a specialized analysis on **${block.name}**.\n\n`
                + backendData.insights.map((insight) => `- **${insight.type.toUpperCase()} (${insight.severity})**: ${insight.message} (${insight.action_window})`).join('\n')
                + `\n\n${backendData.message || 'Ask me how to act on these satellite signals.'}`
            });
            return;
          }

          this.chatHistory.push({
            role: 'assistant',
            content: `Hello! I'm monitoring **${block.name}**.\n\n${backendData.message || 'No satellite interpretation is active right now, but I can help explain NDVI, NDWI, NDRE, EVI, and LAI for you.'}`
          });
        },
        error: () => {
          this.chatHistory.push({
            role: 'assistant',
            content: `Hello! I'm here to help with **${block.name}**. I couldn't load the latest satellite summary, but you can still ask agronomy questions about this block.`
          });
        }
      });
  }
}
