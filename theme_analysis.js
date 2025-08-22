import { Client } from 'pg';
import { PG_CONFIG } from './credentials.js';

const client = new Client(PG_CONFIG);
await client.connect();

console.log('=== THEMES WITH ALL THEIR SUBTHEMES AND REFERENCES ===');
const themesQuery = `
  SELECT t.name as theme_name, t.id as theme_id
  FROM themes t
  ORDER BY t.name
`;

const themes = await client.query(themesQuery);

for (const theme of themes.rows) {
  console.log(`\n🎯 THEME: ${theme.theme_name}`);
  
  const subthemesQuery = `
    SELECT s.name as subtheme_name, s.id as subtheme_id
    FROM subthemes s
    JOIN theme_subthemes ts ON s.id = ts.subtheme_id
    WHERE ts.theme_id = $1
    ORDER BY s.name
  `;
  
  const subthemes = await client.query(subthemesQuery, [theme.theme_id]);
  
  for (const subtheme of subthemes.rows) {
    const referencesQuery = `
      SELECT DISTINCT rr.reference_number
      FROM research_results rr
      JOIN article_subthemes asub ON rr.id = asub.article_id
      WHERE asub.subtheme_id = $1
      ORDER BY rr.reference_number
    `;
    
    const refs = await client.query(referencesQuery, [subtheme.subtheme_id]);
    const refNumbers = refs.rows.map(r => r.reference_number).filter(r => r !== null);
    
    console.log(`  📄 ${subtheme.subtheme_name}: [${refNumbers.join(', ')}]`);
  }
}

await client.end();
