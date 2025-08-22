import { Client } from 'pg';
import { PG_CONFIG } from './credentials.js';

async function checkReferences() {
  const client = new Client(PG_CONFIG);
  await client.connect();
  
  console.log('=== REFERENCE NUMBERS IN DATABASE ===');
  const refResult = await client.query('SELECT reference_number, paper_title FROM research_results ORDER BY reference_number');
  console.log(`Total papers: ${refResult.rows.length}`);
  refResult.rows.forEach(row => {
    console.log(`[${row.reference_number}] ${row.paper_title.substring(0, 60)}...`);
  });
  
  console.log('\n=== ARTICLE-SUBTHEME LINKS ===');
  const linkResult = await client.query(`
    SELECT COUNT(*) as count, asub.subtheme_id, s.name as subtheme_name
    FROM article_subthemes asub
    JOIN subthemes s ON asub.subtheme_id = s.id
    GROUP BY asub.subtheme_id, s.name
    ORDER BY count DESC
  `);
  console.log(`Total subthemes with links: ${linkResult.rows.length}`);
  linkResult.rows.forEach(row => {
    console.log(`Subtheme '${row.subtheme_name}': ${row.count} articles linked`);
  });
  
  console.log('\n=== SAMPLE SUBTHEME REFERENCES ===');
  const sampleResult = await client.query(`
    SELECT s.name as subtheme_name, array_agg(DISTINCT rr.reference_number ORDER BY rr.reference_number) as refs
    FROM subthemes s
    JOIN article_subthemes asub ON s.id = asub.subtheme_id
    JOIN research_results rr ON asub.article_id = rr.id
    GROUP BY s.id, s.name
    LIMIT 10
  `);
  sampleResult.rows.forEach(row => {
    console.log(`${row.subtheme_name}: [${row.refs.join(', ')}]`);
  });
  
  await client.end();
}

checkReferences().catch(console.error);
