const {
  selectKeeper,
  compareKeepers,
  buildSimilarityClusters,
  decideRemovals,
} = require('../services/semanticDedupClusters');

describe('semanticDedupClusters', () => {
  describe('selectKeeper / compareKeepers', () => {
    it('prefers seenGlobally=true over unseen', () => {
      const olderUnseen = {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        seenGlobally: false,
        createdAt: new Date('2020-01-01'),
      };
      const newerSeen = {
        _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        seenGlobally: true,
        createdAt: new Date('2024-01-01'),
      };

      expect(selectKeeper([olderUnseen, newerSeen])._id).toBe(newerSeen._id);
      expect(compareKeepers(newerSeen, olderUnseen)).toBeLessThan(0);
    });

    it('prefers older when seenGlobally ties', () => {
      const older = {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        seenGlobally: false,
        createdAt: new Date('2020-01-01'),
      };
      const newer = {
        _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        seenGlobally: false,
        createdAt: new Date('2024-01-01'),
      };

      expect(selectKeeper([newer, older])._id).toBe(older._id);
    });

    it('uses ObjectId age when createdAt missing', () => {
      // ObjectId timestamp encoded in first 4 bytes
      const olderId = {
        _id: '5f0000000000000000000001',
        seenGlobally: false,
      };
      const newerId = {
        _id: '660000000000000000000001',
        seenGlobally: false,
      };

      expect(selectKeeper([newerId, olderId])._id).toBe(olderId._id);
    });
  });

  describe('buildSimilarityClusters', () => {
    it('clusters exact-ish vectors above threshold', () => {
      const entries = [
        { id: '1', embedding: [1, 0, 0] },
        { id: '2', embedding: [0.99, 0.01, 0] },
        { id: '3', embedding: [0, 1, 0] },
      ];

      const { pairs, clusters } = buildSimilarityClusters(entries, 0.85);
      expect(pairs.length).toBeGreaterThanOrEqual(1);
      expect(pairs.some((p) => p.idA === '1' && p.idB === '2')).toBe(true);

      const clustered = clusters.find((c) => c.includes('1') && c.includes('2'));
      expect(clustered).toBeTruthy();
      expect(clustered).not.toContain('3');
    });

    it('forms a three-way cluster via transitive similarity', () => {
      const entries = [
        { id: 'a', embedding: [1, 0, 0] },
        { id: 'b', embedding: [0.95, 0.05, 0] },
        { id: 'c', embedding: [0.9, 0.1, 0] },
      ];

      const { clusters } = buildSimilarityClusters(entries, 0.85);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].sort()).toEqual(['a', 'b', 'c']);
    });

    it('returns no clusters when all below threshold', () => {
      const entries = [
        { id: '1', embedding: [1, 0, 0] },
        { id: '2', embedding: [0, 1, 0] },
      ];
      const { pairs, clusters } = buildSimilarityClusters(entries, 0.85);
      expect(pairs).toHaveLength(0);
      expect(clusters).toHaveLength(0);
    });
  });

  describe('decideRemovals', () => {
    it('keeps seen question and removes the rest of a pair', () => {
      const questionsById = {
        keep: {
          _id: 'keep',
          seenGlobally: true,
          createdAt: new Date('2024-01-01'),
        },
        drop: {
          _id: 'drop',
          seenGlobally: false,
          createdAt: new Date('2020-01-01'),
        },
      };

      const { decisions, removeIds } = decideRemovals(
        [['keep', 'drop']],
        questionsById
      );

      expect(decisions).toHaveLength(1);
      expect(decisions[0].keepId).toBe('keep');
      expect(removeIds).toEqual(['drop']);
    });

    it('keeps oldest in a three-way cluster when unseen', () => {
      const questionsById = new Map([
        [
          'a',
          { _id: 'a', seenGlobally: false, createdAt: new Date('2019-01-01') },
        ],
        [
          'b',
          { _id: 'b', seenGlobally: false, createdAt: new Date('2021-01-01') },
        ],
        [
          'c',
          { _id: 'c', seenGlobally: false, createdAt: new Date('2023-01-01') },
        ],
      ]);

      const { decisions, removeIds } = decideRemovals([['a', 'b', 'c']], questionsById);
      expect(decisions[0].keepId).toBe('a');
      expect(removeIds.sort()).toEqual(['b', 'c']);
    });
  });
});
