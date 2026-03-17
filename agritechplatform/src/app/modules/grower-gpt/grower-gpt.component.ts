import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdelaideTimePipe } from '../../shared/pipes/adelaide-time.pipe';
import { LucideAngularModule, MessageCircle, Zap, Maximize2, Bot, Send, Sparkles } from 'lucide-angular';
import { GrowerGptService } from '../../services/grower-gpt/grower-gpt.service';
import { BlockService } from '../../shared/services/block.service';
import { UserDataService } from '../../core/services/user-data.service';
import { WaterIrrigationService, IrrigationStatus } from '../../services/water-irrigation/water-irrigation.service';
import { take } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Component({
  selector: 'app-grower-gpt',
  standalone: true,
  imports: [CommonModule, FormsModule, AdelaideTimePipe, LucideAngularModule],
  templateUrl: './grower-gpt.component.html',
  styleUrls: ['./grower-gpt.component.css']
})
export class GrowerGptComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;

  BotIcon = Bot;
  SendIcon = Send;
  SparklesIcon = Sparkles;
  MessageIcon = MessageCircle;

  userMessage: string = '';
  chatHistory: { role: 'user' | 'assistant', content: string }[] = [];
  isLoading: boolean = false;
  irrigationData: IrrigationStatus | null = null;
  recommendedQuestions: string[] = [
    "What is the irrigation plan for this week?",
    "How does the current ET0 affect my Shiraz?",
    "Check for any heat stress risks.",
    "Optimal harvest time based on weather?"
  ];

  constructor(
    public growerGptService: GrowerGptService,
    public blockService: BlockService,
    private userDataService: UserDataService,
    private irrigationService: WaterIrrigationService,
    private sanitizer: DomSanitizer
  ) { }

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
    // Initial load of irrigation data for the selected block
    const block = this.blockService.getSelectedBlock();
    this.irrigationService.getIrrigationStatus(block.lat, block.lon, block.lan, block.crop)
      .pipe(take(1))
      .subscribe({
        next: (status) => {
          this.irrigationData = status;

          // Add initial greeting
          this.chatHistory.push({
            role: 'assistant',
            content: `Hello! I've analyzed **${block.name} - ${block.crop}**. Currently, soil moisture is at ${status.currentHydration.toFixed(1)}%, which is ${status.status}. Would you like an agronomic insight?`
          });
        },
        error: (err) => {
          console.error('Error fetching irrigation status:', err);
          this.chatHistory.push({
            role: 'assistant',
            content: `Hello! I'm here to help, but I'm having trouble fetching the latest irrigation data for **${block.name}**. You can still ask me questions about viticulture or the platform!`
          });
        }
      });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      const element = this.chatContainer.nativeElement.querySelector('.messages-viewport') || this.chatContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
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
      const selectedUser = this.userDataService.getUserById('U001');
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

      // Fetch fresh irrigation data if it's a different block
      let targetIrrigation = this.irrigationData;
      if (targetBlock.lan !== currentBlock.lan || !targetIrrigation) {
        const status = await this.irrigationService.getIrrigationStatus(targetBlock.lat, targetBlock.lon, targetBlock.lan, targetBlock.crop).toPromise();
        targetIrrigation = status || null;
      }

      const reply = await this.growerGptService.askGrowerGPT(
        targetBlock,
        selectedUser,
        targetIrrigation,
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
}
