import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, BookOpen, Search, Filter, ExternalLink, ChevronRight, Bookmark } from 'lucide-angular';

@Component({
  selector: 'app-knowledge-base',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="page-container fade-in">
      <div class="page-header">
        <div class="header-title-section">
          <i-lucide [img]="BookIcon" class="page-icon"></i-lucide>
          <div>
            <h1>Knowledge Base</h1>
            <p class="subtitle">Agronomic library and vineyard management documentation</p>
          </div>
        </div>
      </div>

      <div class="kb-layout">
        <div class="search-section section">
          <div class="search-bar">
            <i-lucide [img]="SearchIcon" class="search-icon"></i-lucide>
            <input type="text" placeholder="Search for variety guides, disease management, or irrigation protocols..." />
          </div>
          <div class="quick-filters">
            <button class="filter-btn active">All Resources</button>
            <button class="filter-btn">Variety Guides</button>
            <button class="filter-btn">Pest & Disease</button>
            <button class="filter-btn">Soil Science</button>
            <button class="filter-btn">Protocols</button>
          </div>
        </div>

        <div class="content-grid">
          <div class="main-content">
            <div class="featured-grid">
              <div class="kb-card featured section">
                <div class="card-content">
                  <div class="badge">Trending Guide</div>
                  <h2>2026 Heatwave Mitigation Strategy</h2>
                  <p>Comprehensive protocols for protecting South Australian vines during extreme thermal events, including canopy management and pulse irrigation timing.</p>
                  <button class="read-btn">Read Full Guide <i-lucide [img]="ChevronRightIcon"></i-lucide></button>
                </div>
              </div>

              <div class="resource-grid">
                <div class="kb-card section" *ngFor="let item of resources">
                  <div class="card-header">
                    <span class="category">{{ item.category }}</span>
                    <i-lucide [img]="BookmarkIcon" class="save-icon"></i-lucide>
                  </div>
                  <h3>{{ item.title }}</h3>
                  <p>{{ item.snippet }}</p>
                  <div class="card-footer">
                    <span class="time">{{ item.readTime }} read</span>
                    <button class="icon-link"><i-lucide [img]="ExternalIcon"></i-lucide></button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="kb-sidebar">
            <div class="section sidebar-section">
              <h3>Popular Topics</h3>
              <div class="topic-list">
                <a href="#" class="topic-item">Downy Mildew Prevention</a>
                <a href="#" class="topic-item">Shiraz Canopy Management</a>
                <a href="#" class="topic-item">Nitrogen Uptake Optimization</a>
                <a href="#" class="topic-item">Post-Harvest Recovery</a>
              </div>
            </div>
            
            <div class="section sidebar-section upgrade-card">
              <div class="upgrade-icon">
                <i-lucide [img]="BookIcon"></i-lucide>
              </div>
              <h4>Offline Access</h4>
              <p>Download our full agronomic library for offline use in the vineyard.</p>
              <button class="upgrade-btn">Download Library</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .header-title-section {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .page-icon {
      width: var(--icon-xl);
      height: var(--icon-xl);
      color: var(--primary-green);
    }

    .subtitle {
      color: var(--gray-600);
      margin: 0;
    }

    .kb-layout {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .section {
      background: var(--white);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-premium);
      border: 1px solid rgba(0,0,0,0.03);
    }

    .search-section {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: var(--gray-50);
      padding: 0.75rem 1.25rem;
      border-radius: var(--radius-full);
      border: 1px solid var(--gray-200);
    }

    .search-icon {
      width: var(--icon-md);
      height: var(--icon-md);
      color: var(--gray-400);
    }

    .search-bar input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-size: 1rem;
      color: var(--gray-800);
    }

    .quick-filters {
      display: flex;
      gap: 0.75rem;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }

    .filter-btn {
      padding: 0.5rem 1.25rem;
      background: var(--white);
      border: 1px solid var(--gray-200);
      border-radius: var(--radius-full);
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--gray-600);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .filter-btn:hover, .filter-btn.active {
      background: var(--primary-green);
      color: var(--white);
      border-color: var(--primary-green);
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 1.5rem;
    }

    .featured-grid {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .kb-card {
      padding: 1.5rem;
      transition: transform 0.2s;
    }

    .kb-card.featured {
      background: linear-gradient(135deg, #2d5a27 0%, #1e3c1a 100%);
      color: var(--white);
      position: relative;
      overflow: hidden;
    }

    .featured .badge {
      background: rgba(255,255,255,0.2);
      padding: 0.25rem 0.75rem;
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 700;
      margin-bottom: 1rem;
      display: inline-block;
    }

    .featured h2 {
      font-size: 1.75rem;
      margin-bottom: 1rem;
      font-weight: 800;
    }

    .featured p {
      font-size: 1rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
      opacity: 0.9;
      max-width: 80%;
    }

    .read-btn {
      background: var(--white);
      color: var(--primary-green);
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: var(--radius-md);
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .resource-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.25rem;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .category {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--primary-green);
      letter-spacing: 0.05em;
    }

    .save-icon {
      width: var(--icon-sm);
      height: var(--icon-sm);
      color: var(--gray-400);
      cursor: pointer;
    }

    .kb-card h3 {
      font-size: 1.125rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      color: var(--gray-900);
    }

    .kb-card p {
      font-size: 0.875rem;
      color: var(--gray-600);
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
    }

    .time {
      font-size: 0.75rem;
      color: var(--gray-400);
    }

    .icon-link {
      background: transparent;
      border: none;
      color: var(--primary-green);
      cursor: pointer;
    }

    .sidebar-section {
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .sidebar-section h3 {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 1.25rem;
    }

    .topic-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .topic-item {
      font-size: 0.875rem;
      color: var(--gray-600);
      text-decoration: none;
      transition: color 0.2s;
    }

    .topic-item:hover {
      color: var(--primary-green);
    }

    .upgrade-card {
      background: var(--bg-beige);
      text-align: center;
      padding: 2rem 1.5rem;
    }

    .upgrade-icon {
      width: 48px;
      height: 48px;
      background: var(--white);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
      color: var(--primary-green);
      box-shadow: var(--shadow-sm);
    }

    .upgrade-card h4 {
      margin-bottom: 0.75rem;
    }

    .upgrade-card p {
      font-size: 0.8125rem;
      color: var(--gray-600);
      margin-bottom: 1.5rem;
    }

    .upgrade-btn {
      width: 100%;
      background: var(--primary-green);
      color: var(--white);
      border: none;
      padding: 0.75rem;
      border-radius: var(--radius-md);
      font-weight: 600;
      cursor: pointer;
    }

    @media (max-width: 1024px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
      .kb-sidebar {
        display: none;
      }
    }
  `]
})
export class KnowledgeBaseComponent {
  BookIcon = BookOpen;
  SearchIcon = Search;
  ChevronRightIcon = ChevronRight;
  BookmarkIcon = Bookmark;
  ExternalIcon = ExternalLink;

  resources = [
    {
      category: 'Variety Guide',
      title: 'Grenache Resilience Protocols',
      snippet: 'Optimizing water use and canopy balance for dry-grown Grenache in McLaren Vale conditions.',
      readTime: '8 min'
    },
    {
      category: 'Soil Science',
      title: 'Understanding Soil Water Tension',
      snippet: 'A deep dive into how soil structure affects matric potential and water availability to vine roots.',
      readTime: '12 min'
    },
    {
      category: 'Disease Management',
      title: 'Mildew Risk Models',
      snippet: 'Implementing the 10:10:24 rule and beyond with digital sensors for proactive fungal protection.',
      readTime: '6 min'
    },
    {
      category: 'Irrigation',
      title: 'RDI in Red Varieties',
      snippet: 'Regulated Deficit Irrigation strategies to maximize anthocyanin concentration and berry quality.',
      readTime: '15 min'
    }
  ];
}