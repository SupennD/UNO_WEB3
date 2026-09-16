import { Shuffler } from '../utils/random_utils'

export const colors = ['BLUE', 'GREEN', 'RED', 'YELLOW'] as const
export type Color = typeof colors[number]

export type Type = 'NUMBERED' | 'SKIP' | 'REVERSE' | 'DRAW' | 'WILD' | 'WILD DRAW'

export interface NumberedCard {
  readonly type: 'NUMBERED'
  readonly color: Color
  readonly number: number
}

export interface ColoredActionCard {
  readonly type: 'SKIP' | 'REVERSE' | 'DRAW'
  readonly color: Color
}

export interface WildCard {
  readonly type: 'WILD' | 'WILD DRAW'
}

export type Card = NumberedCard | ColoredActionCard | WildCard

export type TypedCard<T extends Type> =
  T extends 'NUMBERED' ? NumberedCard :
  T extends 'SKIP' | 'REVERSE' | 'DRAW' ? ColoredActionCard :
  T extends 'WILD' | 'WILD DRAW' ? WildCard :
  never

export type CardMemento = Record<string, string | number>

export function hasColor(card: Card, color: Color): boolean {
  return 'color' in card && card.color === color
}

export function hasNumber(card: Card, number: number): boolean {
  return card.type === 'NUMBERED' && card.number === number
}

export function hasType<T extends Type>(card: Card, type: T): card is TypedCard<T> {
  return card.type === type
}

export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && (colors as readonly string[]).includes(value)
}

export function cardFromMemento(memento: CardMemento): Card {
  const type = memento.type as Type
  switch (type) {
    case 'NUMBERED': {
      if (!isColor(memento.color)) throw new Error('Numbered card requires a valid color')
      if (typeof memento.number !== 'number') throw new Error('Numbered card requires a number')
      return { type: 'NUMBERED', color: memento.color, number: memento.number }
    }
    case 'SKIP':
    case 'REVERSE':
    case 'DRAW': {
      if (!isColor(memento.color)) throw new Error(`${type} card requires a valid color`)
      return { type, color: memento.color }
    }
    case 'WILD':
    case 'WILD DRAW':
      return { type }
    default:
      throw new Error(`Unknown card type: ${String(memento.type)}`)
  }
}

export function cardToMemento(card: Card): CardMemento {
  switch (card.type) {
    case 'NUMBERED':
      return { type: 'NUMBERED', color: card.color, number: card.number }
    case 'SKIP':
    case 'REVERSE':
    case 'DRAW':
      return { type: card.type, color: card.color }
    default:
      return { type: card.type }
  }
}

export function buildFullCardSet(): Card[] {
  const cards: Card[] = []
  for (const color of colors) {
    cards.push({ type: 'NUMBERED', color, number: 0 })
    for (let number = 1; number <= 9; number++) {
      cards.push({ type: 'NUMBERED', color, number })
      cards.push({ type: 'NUMBERED', color, number })
    }
    cards.push({ type: 'SKIP', color })
    cards.push({ type: 'SKIP', color })
    cards.push({ type: 'REVERSE', color })
    cards.push({ type: 'REVERSE', color })
    cards.push({ type: 'DRAW', color })
    cards.push({ type: 'DRAW', color })
  }
  for (let i = 0; i < 4; i++) cards.push({ type: 'WILD' })
  for (let i = 0; i < 4; i++) cards.push({ type: 'WILD DRAW' })
  return cards
}

export interface Deck {
  readonly size: number
  deal(): Card | undefined
  top(): Card | undefined
  peek(): Card | undefined
  shuffle(shuffler: Shuffler<Card>): void
  filter(predicate: (card: Card) => boolean): Deck
  toMemento(): CardMemento[]
}

export class CardDeck implements Deck {
  constructor(private cards: Card[]) {}

  get size(): number {
    return this.cards.length
  }

  deal(): Card | undefined {
    return this.cards.shift()
  }

  top(): Card | undefined {
    return this.cards[0]
  }

  peek(): Card | undefined {
    return this.cards[0]
  }

  shuffle(shuffler: Shuffler<Card>): void {
    shuffler(this.cards)
  }

  filter(predicate: (card: Card) => boolean): Deck {
    return new CardDeck(this.cards.filter(predicate))
  }

  toMemento(): CardMemento[] {
    return this.cards.map(cardToMemento)
  }

  put(card: Card): void {
    this.cards.unshift(card)
  }

  drainExceptTop(): Card[] {
    return this.cards.splice(1)
  }

  refill(cards: Card[], shuffler: Shuffler<Card>): void {
    this.cards = [...cards]
    shuffler(this.cards)
  }
}

export function createFullDeck(): Deck {
  return new CardDeck(buildFullCardSet())
}

export function createDeckFromMemento(mementos: CardMemento[]): Deck {
  return new CardDeck(mementos.map(cardFromMemento))
}
