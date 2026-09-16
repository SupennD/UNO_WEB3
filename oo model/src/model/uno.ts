import { Card } from './deck'
import { Round, RoundMemento, newRound, roundFromMemento } from './round'
import { Randomizer, Shuffler, standardRandomizer, standardShuffler } from '../utils/random_utils'

export type GameMemento = {
  players: string[]
  targetScore: number
  scores: number[]
  cardsPerPlayer: number
  currentRound?: RoundMemento
}

export interface Game {
  readonly playerCount: number
  readonly targetScore: number
  player(index: number): string
  score(index: number): number
  winner(): number | undefined
  currentRound(): Round | undefined
  toMemento(): GameMemento
}

class GameImpl implements Game {
  private readonly scores: number[]
  private round: Round | undefined
  private finished: boolean
  private winnerIndex: number | undefined

  constructor(
    private readonly players: string[],
    readonly targetScore: number,
    scores: number[],
    private readonly cardsPerPlayer: number,
    private readonly shuffler: Shuffler<Card>,
    initialRound: Round | undefined
  ) {
    this.scores = [...scores]
    if (initialRound) {
      this.finished = false
      this.attachRound(initialRound)
    } else {
      this.finished = true
      this.winnerIndex = this.scores.findIndex(s => s >= targetScore)
    }
  }

  private attachRound(round: Round): void {
    this.round = round
    round.onEnd(({ winner }) => {
      this.scores[winner] += round.score()!
      if (this.scores[winner] >= this.targetScore) {
        this.finished = true
        this.winnerIndex = winner
        this.round = undefined
      } else {
        const nextDealer = (round.dealer + 1) % this.players.length
        this.attachRound(newRound({
          players: this.players,
          dealer: nextDealer,
          shuffler: this.shuffler,
          cardsPerPlayer: this.cardsPerPlayer
        }))
      }
    })
  }

  get playerCount(): number {
    return this.players.length
  }

  player(index: number): string {
    if (index < 0 || index >= this.players.length) throw new Error('Player index out of bounds')
    return this.players[index]
  }

  score(index: number): number {
    return this.scores[index]
  }

  winner(): number | undefined {
    return this.winnerIndex
  }

  currentRound(): Round | undefined {
    return this.finished ? undefined : this.round
  }

  toMemento(): GameMemento {
    const memento: GameMemento = {
      players: [...this.players],
      targetScore: this.targetScore,
      scores: [...this.scores],
      cardsPerPlayer: this.cardsPerPlayer
    }
    if (this.round) memento.currentRound = this.round.toMemento()
    return memento
  }
}

export type NewGameProps = {
  players?: string[]
  targetScore?: number
  randomizer?: Randomizer
  shuffler?: Shuffler<Card>
  cardsPerPlayer?: number
}

export function newGame(props: NewGameProps = {}): Game {
  const players = props.players ?? ['A', 'B']
  const targetScore = props.targetScore ?? 500
  const randomizer = props.randomizer ?? standardRandomizer
  const shuffler = props.shuffler ?? standardShuffler
  const cardsPerPlayer = props.cardsPerPlayer ?? 7

  if (players.length < 2) throw new Error('A game requires at least 2 players')
  if (targetScore <= 0) throw new Error('Target score must be greater than 0')

  const dealer = randomizer(players.length)
  const round = newRound({ players, dealer, shuffler, cardsPerPlayer })
  const scores = players.map(() => 0)
  return new GameImpl(players, targetScore, scores, cardsPerPlayer, shuffler, round)
}

export function gameFromMemento(
  memento: GameMemento,
  randomizer: Randomizer = standardRandomizer,
  shuffler: Shuffler<Card> = standardShuffler
): Game {
  if (memento.players.length < 2) throw new Error('A game requires at least 2 players')
  if (memento.targetScore <= 0) throw new Error('Target score must be greater than 0')
  if (memento.scores.length !== memento.players.length) throw new Error('There must be exactly one score per player')
  if (memento.scores.some(score => score < 0)) throw new Error('Scores cannot be negative')

  const winners = memento.scores.filter(score => score >= memento.targetScore).length
  if (winners > 1) throw new Error('A game can have at most one winner')

  if (winners === 1) {
    return new GameImpl(memento.players, memento.targetScore, memento.scores, memento.cardsPerPlayer, shuffler, undefined)
  }

  if (!memento.currentRound) throw new Error('An unfinished game requires a current round')
  const round = roundFromMemento(memento.currentRound, shuffler)
  return new GameImpl(memento.players, memento.targetScore, memento.scores, memento.cardsPerPlayer, shuffler, round)
}
