import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { User } from '../../core/models/user.model';
import { MOCK_BLOCKS } from '../constants';
import { Block } from '../models';

@Injectable({
  providedIn: 'root'
})
export class BlockService {
  private readonly BLOCK_STORAGE_KEY = 'agritech_active_block';

  private readonly blocksSubject = new BehaviorSubject<Block[]>(MOCK_BLOCKS);
  private readonly selectedBlockSubject = new BehaviorSubject<Block>(this.getStoredBlockFromMock() || MOCK_BLOCKS[0]);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  readonly blocks$: Observable<Block[]> = this.blocksSubject.asObservable();
  readonly block$: Observable<Block> = this.selectedBlockSubject.asObservable();
  readonly selectedBlock$: Observable<Block> = this.block$;
  readonly loading$: Observable<boolean> = this.loadingSubject.asObservable();
  readonly error$: Observable<string | null> = this.errorSubject.asObservable();

  initializeForUser(user: User | null): void {
    if (!user) {
      this.clearBlocks();
      return;
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    try {
      const mappedBlocks = this.mapUserBlocks(user);
      const blocksToUse = mappedBlocks.length > 0 ? mappedBlocks : MOCK_BLOCKS;
      this.blocksSubject.next(blocksToUse);

      const storedLan = this.getStoredLan();
      const defaultBlock = blocksToUse.find(block => block.lan === storedLan) || blocksToUse[0];
      this.setBlock(defaultBlock);
    } catch (error) {
      console.error('BlockService: Failed to initialize user blocks. Falling back to mock blocks.', error);
      this.errorSubject.next('Failed to load blocks from API. Using fallback blocks.');
      this.blocksSubject.next(MOCK_BLOCKS);
      this.setBlock(MOCK_BLOCKS[0]);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  setBlocks(blocks: Block[]): void {
    const blocksToUse = blocks.length > 0 ? blocks : MOCK_BLOCKS;
    this.blocksSubject.next(blocksToUse);

    const currentLan = this.selectedBlockSubject.value?.lan;
    const nextBlock = blocksToUse.find(block => block.lan === currentLan) || blocksToUse[0];
    this.setBlock(nextBlock);
  }

  getBlocks(): Block[] {
    return this.blocksSubject.value;
  }

  setBlock(block: Block): void {
    this.setSelectedBlock(block);
  }

  getBlock(): Block {
    return this.getSelectedBlock();
  }

  setSelectedBlock(block: Block): void {
    console.log('BlockService: Setting selected block:', block.name);
    this.selectedBlockSubject.next(block);
    localStorage.setItem(this.BLOCK_STORAGE_KEY, JSON.stringify({ lan: block.lan }));
  }

  getSelectedBlock(): Block {
    return this.selectedBlockSubject.value;
  }

  clearBlocks(): void {
    this.blocksSubject.next(MOCK_BLOCKS);
    this.selectedBlockSubject.next(MOCK_BLOCKS[0]);
    this.loadingSubject.next(false);
    this.errorSubject.next(null);
    localStorage.removeItem(this.BLOCK_STORAGE_KEY);
  }

  private mapUserBlocks(user: User): Block[] {
    return user.blocks.map((block, index) => {
      const blockNumber = index + 1;

      return {
        id: block.id || block.lanslu,
        name: `BLOCK ${blockNumber} - ${block.crop || user.primaryCropName}`,
        location: this.getBlockLocation(user.farmLocation, block.latitude, block.longitude),
        coordinates: block.latitude && block.longitude ? `${Math.abs(block.latitude).toFixed(4)}°S, ${Math.abs(block.longitude).toFixed(4)}°E` : '',
        size: block.area,
        sizeUnit: 'ha',
        grapeVariety: block.crop || user.primaryCropName,
        crop: block.crop || user.primaryCropName,
        soilType: block.primarySoilClass,
        soilDescription: block.description,
        lat: block.latitude,
        lon: block.longitude,
        lan: block.lanslu,
        polygon: block.polygon || null
      };
    });
  }

  private getBlockLocation(farmLocation: string, latitude?: number, longitude?: number): string {
    if (!latitude || !longitude) {
      return farmLocation;
    }

    if (latitude === -34.171 && longitude === 140.738) return 'Angove\'s Winery, Renmark';
    if (latitude === -34.2 && longitude === 140.745) return 'Mallee Estate, Renmark Ave';
    if (latitude === -34.524 && longitude === 138.963) return 'Chateau Tanunda, Tanunda';
    if (latitude === -34.536 && longitude === 138.985) return 'Yalumba, Angaston';
    if (latitude === -35.219 && longitude === 138.547) return 'd\'Arenberg, McLaren Vale';
    if (latitude === -35.225 && longitude === 138.553) return 'Willunga area, McLaren Vale';
    if (latitude === -34.178 && longitude === 139.987) return 'Waikerie area, Riverland';
    if (latitude === -34.185 && longitude === 139.995) return 'Near Waikerie, Riverland';
    if (latitude === -34.542 && longitude === 138.993) return 'Wolf Blass, Nuriootpa';

    return farmLocation;
  }
  private getStoredLan(): string | null {
    const stored = localStorage.getItem(this.BLOCK_STORAGE_KEY);
    if (!stored) return null;

    try {
      const { lan } = JSON.parse(stored);
      return lan || null;
    } catch {
      return null;
    }
  }

  private getStoredBlockFromMock(): Block | null {
    const storedLan = this.getStoredLan();
    if (!storedLan) return null;
    return MOCK_BLOCKS.find(block => block.lan === storedLan) || null;
  }
}
