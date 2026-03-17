import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Block } from '../models';
import { MOCK_BLOCKS } from '../constants';

@Injectable({
  providedIn: 'root'
})
export class BlockService {
  private selectedBlockSubject = new BehaviorSubject<Block>(MOCK_BLOCKS[0]);
  selectedBlock$: Observable<Block> = this.selectedBlockSubject.asObservable();

  constructor() {}

  setSelectedBlock(block: Block): void {
    console.log('BlockService: Setting selected block:', block.name);
    this.selectedBlockSubject.next(block);
  }

  getSelectedBlock(): Block {
    return this.selectedBlockSubject.value;
  }
}
