import { Randomizer, Shuffler, standardRandomizer, standardShuffler } from '../../src/utils/random_utils'
import { Card, CardMemento, Deck, createDeckFromMemento as buildDeckFromMemento, createFullDeck } from '../../src/model/deck'
import { Round, RoundMemento, newRound, roundFromMemento } from '../../src/model/round'
import { Game, GameMemento, newGame, gameFromMemento } from '../../src/model/uno'

export function createInitialDeck(): Deck {
  return createFullDeck()
}

export function createDeckFromMemento(cards: Record<string, string | number>[]): Deck {
  return buildDeckFromMemento(cards as CardMemento[])
}

export type HandConfig = {
  players: string[]
  dealer: number
  shuffler?: Shuffler<Card>
  cardsPerPlayer?: number
}

export function createRound({
    players,
    dealer,
    shuffler = standardShuffler,
    cardsPerPlayer = 7
  }: HandConfig): Round {
  return newRound({ players, dealer, shuffler, cardsPerPlayer })
}

export function createRoundFromMemento(memento: RoundMemento, shuffler: Shuffler<Card> = standardShuffler): Round {
  return roundFromMemento(memento, shuffler)
}

export type GameConfig = {
  players: string[]
  targetScore: number
  randomizer: Randomizer
  shuffler: Shuffler<Card>
  cardsPerPlayer: number
}

export function createGame(props: Partial<GameConfig>): Game {
  return newGame(props)
}

export function createGameFromMemento(memento: GameMemento, randomizer: Randomizer = standardRandomizer, shuffler: Shuffler<Card> = standardShuffler): Game {
  return gameFromMemento(memento, randomizer, shuffler)
}
