import { Client } from 'pg';
import { PG_CONFIG } from './credentials.js';

const client = new Client(PG_CONFIG);
await client.connect();

console.log('=== API QUERY TEST ===');
const referencesQuery = `
  SELECT DISTINCT rr.reference_number
  FROM research_results rr
  JOIN article_subthemes asub ON rr.id = asub.article_id
  WHERE asub.subtheme_id = $1
  ORDER BY rr.reference_number
`;

// Test with first few subthemes
const subthemes = await client.query('SELECT id, name FROM subthemes LIMIT 5');
for (const sub of subthemes.rows) {
  const refs = await client.query(referencesQuery, [sub.id]);
  const refNumbers = refs.rows.map(r => r.reference_number).filter(r => r !== null);
  console.log(`Subtheme '${sub.name}' (ID: ${sub.id}): [${refNumbers.join(', ')}]`);
}

// Also check what themes have multiple subthemes
console.log('\n=== THEMES WITH MULTIPLE SUBTHEMES ===');
const themeSubthemeCount = await client.query(`
  SELECT t.name as theme_name, COUNT(ts.subtheme_id) as subtheme_count
  FROM themes t
  LEFT JOIN theme_subthemes ts ON t.id = ts.theme_id
  GROUP BY t.id, t.name
  HAVING COUNT(ts.subtheme_id) > 1
  ORDER BY subtheme_count DESC
`);

themeSubthemeCount.rows.forEach(row => {
  console.log(`Theme '${row.theme_name}': ${row.subtheme_count} subthemes`);
});

await client.end();
