import { Client } from 'pg';
import { PG_CONFIG } from './credentials.js';

const client = new Client(PG_CONFIG);
await client.connect();

console.log('=== CHECKING ARTICLE-SUBTHEME RELATIONSHIPS ===');

// Check how many total papers we have
const totalPapers = await client.query('SELECT COUNT(*) FROM research_results');
console.log(`Total papers in database: ${totalPapers.rows[0].count}`);

// Check how many article-subtheme relationships we have
const totalLinks = await client.query('SELECT COUNT(*) FROM article_subthemes');
console.log(`Total article-subtheme links: ${totalLinks.rows[0].count}`);

// Check if multiple papers are linked to the same subtheme
const multiPaperSubthemes = await client.query(`
  SELECT s.name, COUNT(DISTINCT asub.article_id) as paper_count, array_agg(DISTINCT rr.reference_number ORDER BY rr.reference_number) as refs
  FROM subthemes s
  JOIN article_subthemes asub ON s.id = asub.subtheme_id
  JOIN research_results rr ON asub.article_id = rr.id
  GROUP BY s.id, s.name
  HAVING COUNT(DISTINCT asub.article_id) > 1
  ORDER BY paper_count DESC
`);

console.log(`\nSubthemes with multiple papers (${multiPaperSubthemes.rows.length} found):`);
multiPaperSubthemes.rows.forEach(row => {
  console.log(`${row.name}: ${row.paper_count} papers [${row.refs.join(', ')}]`);
});

// Check distribution of papers per subtheme
const distribution = await client.query(`
  SELECT paper_count, COUNT(*) as subtheme_count
  FROM (
    SELECT COUNT(DISTINCT asub.article_id) as paper_count
    FROM subthemes s
    JOIN article_subthemes asub ON s.id = asub.subtheme_id
    GROUP BY s.id
  ) counts
  GROUP BY paper_count
  ORDER BY paper_count
`);

console.log('\n=== DISTRIBUTION OF PAPERS PER SUBTHEME ===');
distribution.rows.forEach(row => {
  console.log(`${row.subtheme_count} subthemes have ${row.paper_count} paper(s) each`);
});

await client.end();
