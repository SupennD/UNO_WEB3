import { Card, CardDeck, CardMemento, Color, buildFullCardSet, cardFromMemento, cardToMemento, isColor } from './deck'
import { Hand, PlayerHand } from './hand'
import { Shuffler, standardShuffler } from '../utils/random_utils'

export type Direction = 'clockwise' | 'counterclockwise'

export type RoundMemento = {
  players: string[]
  hands: CardMemento[][]
  drawPile: CardMemento[]
  discardPile: CardMemento[]
  currentColor: Color
  currentDirection: Direction
  dealer: number
  playerInTurn?: number
}

export type UnoFailureAccusation = {
  accuser: number
  accused: number
}

export type RoundEndEvent = {
  winner: number
}

export interface Round {
  readonly playerCount: number
  readonly dealer: number
  player(index: number): string
  playerHand(index: number): Hand
  drawPile(): CardDeck
  discardPile(): CardDeck
  playerInTurn(): number | undefined
  canPlay(index: number): boolean
  canPlayAny(): boolean
  play(index: number, chosenColor?: Color): Card
  draw(): void
  sayUno(index: number): void
  catchUnoFailure(accusation: UnoFailureAccusation): boolean
  hasEnded(): boolean
  winner(): number | undefined
  score(): number | undefined
  onEnd(callback: (event: RoundEndEvent) => void): void
  toMemento(): RoundMemento
}

function cardValue(card: Card): number {
  switch (card.type) {
    case 'NUMBERED':
      return card.number
    case 'SKIP':
    case 'REVERSE':
    case 'DRAW':
      return 20
    default:
      return 50
  }
}

function isWildType(card: Card): boolean {
  return card.type === 'WILD' || card.type === 'WILD DRAW'
}

function matches(card: Card, hand: readonly Card[], topCard: Card, currentColor: Color): boolean {
  if (card.type === 'WILD') return true
  if (card.type === 'WILD DRAW') {
    return !hand.some(c => 'color' in c && c.color === currentColor)
  }
  if ('color' in card && card.color === currentColor) return true
  if (card.type === 'NUMBERED' && topCard.type === 'NUMBERED' && card.number === topCard.number) return true
  if (card.type === topCard.type && (card.type === 'SKIP' || card.type === 'REVERSE' || card.type === 'DRAW')) return true
  return false
}

class RoundImpl implements Round {
  private readonly handCards: Card[][]
  private readonly handViews: PlayerHand[]
  private readonly drawDeck: CardDeck
  private readonly discardDeck: CardDeck
  private direction: Direction
  private turn: number | undefined
  private currentColor: Color
  private ended = false
  private winnerIndex: number | undefined
  private readonly endCallbacks: ((event: RoundEndEvent) => void)[] = []
  private readonly preemptiveUno = new Set<number>()
  private vulnerable: { player: number; closesWhenPlayed: number } | undefined

  constructor(
    private readonly players: string[],
    readonly dealer: number,
    handCards: Card[][],
    drawCards: Card[],
    discardCards: Card[],
    currentColor: Color,
    direction: Direction,
    turn: number | undefined,
    private readonly shuffler: Shuffler<Card>
  ) {
    this.handCards = handCards
    this.handViews = handCards.map(cards => new PlayerHand(cards))
    this.drawDeck = new CardDeck(drawCards)
    this.discardDeck = new CardDeck(discardCards)
    this.currentColor = currentColor
    this.direction = direction
    this.turn = turn

    const emptyIndex = handCards.findIndex(hand => hand.length === 0)
    if (emptyIndex !== -1) {
      this.ended = true
      this.winnerIndex = emptyIndex
      this.turn = undefined
    }
  }

  get playerCount(): number {
    return this.players.length
  }

  player(index: number): string {
    if (index < 0 || index >= this.players.length) throw new Error('Player index out of bounds')
    return this.players[index]
  }

  playerHand(index: number): Hand {
    if (index < 0 || index >= this.players.length) throw new Error('Player index out of bounds')
    return this.handViews[index]
  }

  drawPile(): CardDeck {
    return this.drawDeck
  }

  discardPile(): CardDeck {
    return this.discardDeck
  }

  playerInTurn(): number | undefined {
    return this.turn
  }

  hasEnded(): boolean {
    return this.ended
  }

  winner(): number | undefined {
    return this.winnerIndex
  }

  canPlay(index: number): boolean {
    if (this.ended || this.turn === undefined) return false
    const hand = this.handCards[this.turn]
    if (index < 0 || index >= hand.length) return false
    const card = hand[index]
    return matches(card, hand, this.discardDeck.top()!, this.currentColor)
  }

  canPlayAny(): boolean {
    if (this.ended || this.turn === undefined) return false
    const hand = this.handCards[this.turn]
    return hand.some((_, i) => this.canPlay(i))
  }

  private ensureNotEnded(): void {
    if (this.ended) throw new Error('The round has ended')
  }

  private stepsFrom(player: number, steps: number): number {
    const n = this.playerCount
    const delta = this.direction === 'clockwise' ? steps : -steps
    return ((player + delta) % n + n) % n
  }

  private beginTurnHousekeeping(actingPlayer: number): void {
    for (const p of Array.from(this.preemptiveUno)) {
      if (p !== actingPlayer) this.preemptiveUno.delete(p)
    }
    if (this.vulnerable && this.vulnerable.closesWhenPlayed === actingPlayer) {
      this.vulnerable = undefined
    }
  }

  private drawOneCard(): Card {
    if (this.drawDeck.size === 0) this.reshuffleDrawPile()
    const card = this.drawDeck.deal()!
    if (this.drawDeck.size === 0) this.reshuffleDrawPile()
    return card
  }

  private reshuffleDrawPile(): void {
    const remainder = this.discardDeck.drainExceptTop()
    this.drawDeck.refill(remainder, this.shuffler)
  }

  private giveCards(player: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.handCards[player].push(this.drawOneCard())
    }
  }

  play(index: number, chosenColor?: Color): Card {
    this.ensureNotEnded()
    const player = this.turn!
    const hand = this.handCards[player]
    if (index < 0 || index >= hand.length) throw new Error('No such card in hand')
    if (!this.canPlay(index)) throw new Error('Illegal play')
    const card = hand[index]
    const wild = isWildType(card)
    if (wild && chosenColor === undefined) throw new Error('Must name a color when playing a wild card')
    if (!wild && chosenColor !== undefined) throw new Error('Cannot name a color when playing a colored card')

    this.beginTurnHousekeeping(player)

    hand.splice(index, 1)
    this.discardDeck.put(card)
    this.currentColor = wild ? chosenColor! : (card as { color: Color }).color

    const wentOut = hand.length === 0

    // A Draw 2 / Wild Draw 4 still forces the next player to draw, even if
    // it was the card that ended the round.
    if (card.type === 'DRAW') {
      this.giveCards(this.stepsFrom(player, 1), 2)
    } else if (card.type === 'WILD DRAW') {
      this.giveCards(this.stepsFrom(player, 1), 4)
    }

    if (wentOut) {
      this.ended = true
      this.winnerIndex = player
      this.turn = undefined
      const event = { winner: player }
      this.endCallbacks.forEach(cb => cb(event))
      return card
    }

    switch (card.type) {
      case 'SKIP':
        this.turn = this.stepsFrom(player, 2)
        break
      case 'REVERSE':
        this.direction = this.direction === 'clockwise' ? 'counterclockwise' : 'clockwise'
        this.turn = this.stepsFrom(player, this.playerCount === 2 ? 2 : 1)
        break
      case 'DRAW':
      case 'WILD DRAW':
        this.turn = this.stepsFrom(player, 2)
        break
      default:
        this.turn = this.stepsFrom(player, 1)
    }

    if (hand.length === 1) {
      if (this.preemptiveUno.has(player)) {
        this.preemptiveUno.delete(player)
      } else {
        this.vulnerable = { player, closesWhenPlayed: this.turn! }
      }
    }

    return card
  }

  draw(): void {
    this.ensureNotEnded()
    const player = this.turn!
    this.beginTurnHousekeeping(player)
    const card = this.drawOneCard()
    this.handCards[player].push(card)
    const playable = matches(card, this.handCards[player], this.discardDeck.top()!, this.currentColor)
    if (!playable) {
      this.turn = this.stepsFrom(player, 1)
    }
  }

  sayUno(index: number): void {
    this.ensureNotEnded()
    if (index < 0 || index >= this.playerCount) throw new Error('Player index out of bounds')
    if (this.vulnerable && this.vulnerable.player === index) {
      this.vulnerable = undefined
    } else {
      this.preemptiveUno.add(index)
    }
  }

  catchUnoFailure({ accused }: UnoFailureAccusation): boolean {
    if (accused < 0 || accused >= this.playerCount) throw new Error('Player index out of bounds')
    if (this.vulnerable && this.vulnerable.player === accused) {
      this.giveCards(accused, 4)
      this.vulnerable = undefined
      return true
    }
    return false
  }

  score(): number | undefined {
    if (!this.ended) return undefined
    let total = 0
    for (let i = 0; i < this.playerCount; i++) {
      if (i === this.winnerIndex) continue
      for (const card of this.handCards[i]) {
        total += cardValue(card)
      }
    }
    return total
  }

  onEnd(callback: (event: RoundEndEvent) => void): void {
    this.endCallbacks.push(callback)
  }

  toMemento(): RoundMemento {
    return {
      players: [...this.players],
      hands: this.handCards.map(hand => hand.map(cardToMemento)),
      drawPile: this.drawDeck.toMemento(),
      discardPile: this.discardDeck.toMemento(),
      currentColor: this.currentColor,
      currentDirection: this.direction,
      dealer: this.dealer,
      playerInTurn: this.turn
    }
  }
}

export type NewRoundProps = {
  players: string[]
  dealer: number
  shuffler?: Shuffler<Card>
  cardsPerPlayer?: number
}

export function newRound({ players, dealer, shuffler = standardShuffler, cardsPerPlayer = 7 }: NewRoundProps): Round {
  if (players.length < 2 || players.length > 10) throw new Error('A round requires between 2 and 10 players')

  let handCards: Card[][] = []
  let drawCards: Card[] = []
  let topCard: Card

  for (;;) {
    const deck = buildFullCardSet()
    shuffler(deck)
    handCards = []
    let cursor = 0
    for (let p = 0; p < players.length; p++) {
      handCards.push(deck.slice(cursor, cursor + cardsPerPlayer))
      cursor += cardsPerPlayer
    }
    topCard = deck[cursor]
    cursor += 1
    if (topCard.type !== 'WILD' && topCard.type !== 'WILD DRAW') {
      drawCards = deck.slice(cursor)
      break
    }
  }

  const n = players.length
  let direction: Direction = 'clockwise'
  let turn = (dealer + 1) % n
  const currentColor = (topCard as { color: Color }).color

  if (topCard.type === 'REVERSE') {
    direction = 'counterclockwise'
    turn = ((dealer - 1) % n + n) % n
  } else if (topCard.type === 'SKIP') {
    turn = (dealer + 2) % n
  } else if (topCard.type === 'DRAW') {
    const first = (dealer + 1) % n
    handCards[first].push(...drawCards.splice(0, 2))
    turn = (dealer + 2) % n
  }

  return new RoundImpl(players, dealer, handCards, drawCards, [topCard], currentColor, direction, turn, shuffler)
}

export function roundFromMemento(memento: RoundMemento, shuffler: Shuffler<Card> = standardShuffler): Round {
  const n = memento.players.length
  if (n < 2 || n > 10) throw new Error('A round requires between 2 and 10 players')
  if (!memento.hands || memento.hands.length !== n) throw new Error('There must be exactly one hand per player')
  if (memento.dealer < 0 || memento.dealer >= n) throw new Error('Dealer index out of bounds')
  if (!isColor(memento.currentColor)) throw new Error('Invalid current color')
  if (!memento.discardPile || memento.discardPile.length === 0) throw new Error('Discard pile cannot be empty')

  const handCards = memento.hands.map(hand => hand.map(cardFromMemento))
  const emptyHands = handCards.filter(hand => hand.length === 0).length
  if (emptyHands > 1) throw new Error('At most one player can have an empty hand')
  const finished = emptyHands === 1

  if (memento.playerInTurn !== undefined && (memento.playerInTurn < 0 || memento.playerInTurn >= n)) {
    throw new Error('Player in turn out of bounds')
  }
  if (!finished && memento.playerInTurn === undefined) {
    throw new Error('An unfinished round requires a player in turn')
  }

  const discardCards = memento.discardPile.map(cardFromMemento)
  const topCard = discardCards[0]
  if ('color' in topCard && topCard.color !== memento.currentColor) {
    throw new Error('Current color is inconsistent with the top of the discard pile')
  }
  const drawCards = (memento.drawPile ?? []).map(cardFromMemento)

  return new RoundImpl(
    memento.players,
    memento.dealer,
    handCards,
    drawCards,
    discardCards,
    memento.currentColor,
    memento.currentDirection,
    memento.playerInTurn,
    shuffler
  )
}
