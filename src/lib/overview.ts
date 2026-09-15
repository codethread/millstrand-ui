import type { Card } from '../../shared/api';
import { emptyFilter, selectCards } from './board';

export function overviewCards(cards: Card[]): Card[] {
  return selectCards(cards, { ...emptyFilter(), lanes: ['claimed', 'in_review', 'in_production'] });
}
