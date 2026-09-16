import { Card } from './deck'

export interface Hand {
  readonly length: number
  at(index: number): Card | undefined
  forEach(callback: (card: Card, index: number) => void): void
}

export class PlayerHand implements Hand {
  constructor(private readonly cards: Card[]) {}

  get length(): number {
    return this.cards.length
  }

  at(index: number): Card | undefined {
    return this.cards.at(index)
  }

  forEach(callback: (card: Card, index: number) => void): void {
    this.cards.forEach(callback)
  }
}
