export const logProvenanceAttributeKeys = [
  'identity/session',
  'identity/id',
  'identity/harness',
  'identity/native-session-id',
  'harness/run',
  'harness/published',
  'harness/request-id',
  'harness/session-id',
  'harness/alias',
  'harness/harness',
  'harness/status',
  'harness/substatus',
  'harness/mode',
  'harness/observed-model',
  'harness/observed-effort',
  'harness/ownership',
  'harness/cwd',
  'harness/started-at',
  'harness/finished-at',
] as const;

function placeholders(values: readonly string[]): string {
  return values.map(() => '?').join(', ');
}

export function logProvenanceSql(edgeLimit: number): string {
  return `
  WITH candidate_markers AS (
    SELECT marker.strand_id,
           MAX(marker.key = 'identity/session') AS is_identity,
           MAX(marker.key = 'harness/run') AS is_run,
           MAX(marker.key = 'harness/published') AS is_published
    FROM attributes AS marker
    WHERE marker.archived = 0
      AND marker.key IN ('identity/session', 'harness/run', 'harness/published')
      AND marker.value = '"true"'
    GROUP BY marker.strand_id
    HAVING is_identity OR (is_run AND is_published)
  ),
  projected_strands AS (
    SELECT json_object(
             'kind', 'strand',
             'id', strands.id,
             'title', strands.title,
             'state', strands.state,
             'created_at', strands.created_at,
             'updated_at', strands.updated_at,
             'attributes', json(COALESCE(
               (
                 SELECT json_group_object(attributes.key, json(attributes.value))
                 FROM attributes
                 WHERE attributes.strand_id = strands.id
                   AND attributes.archived = 0
                   AND attributes.key IN (${placeholders(logProvenanceAttributeKeys)})
               ),
               '{}'
             ))
           ) AS record
    FROM candidate_markers
    JOIN strands ON strands.id = candidate_markers.strand_id
    ORDER BY strands.id
  ),
  projected_edges AS (
    SELECT json_object(
             'kind', 'edge',
             'from_strand_id', strand_edges.from_strand_id,
             'to_strand_id', strand_edges.to_strand_id,
             'edge_type', strand_edges.edge_type
           ) AS record
    FROM strand_edges
    JOIN candidate_markers AS source
      ON source.strand_id = strand_edges.from_strand_id
    JOIN candidate_markers AS target
      ON target.strand_id = strand_edges.to_strand_id
    WHERE strand_edges.edge_type = 'performed'
      AND source.is_identity
      AND target.is_run
      AND target.is_published
    LIMIT ${edgeLimit + 1}
  )
  SELECT record FROM projected_strands
  UNION ALL
  SELECT record FROM projected_edges
`;
}
