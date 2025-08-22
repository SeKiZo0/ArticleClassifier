import { PG_CONFIG } from './credentials.js';
import { Client } from 'pg';

const client = new Client(PG_CONFIG);

async function viewResults() {
  try {
    await client.connect();
    console.log('Connected to database to view results...\n');

    // Count totals
    const paperCount = await client.query('SELECT COUNT(*) FROM research_results');
    const themeCount = await client.query('SELECT COUNT(*) FROM themes');
    const subthemeCount = await client.query('SELECT COUNT(*) FROM subthemes');
    const codeCount = await client.query('SELECT COUNT(*) FROM codes');
    const themeSubthemeLinks = await client.query('SELECT COUNT(*) FROM theme_subthemes');
    const articleSubthemeLinks = await client.query('SELECT COUNT(*) FROM article_subthemes');
    const articleCodeLinks = await client.query('SELECT COUNT(*) FROM article_codes');

    console.log('=== DATABASE SUMMARY ===');
    console.log(`Total Papers: ${paperCount.rows[0].count}`);
    console.log(`Total Themes: ${themeCount.rows[0].count}`);
    console.log(`Total Sub-themes: ${subthemeCount.rows[0].count}`);
    console.log(`Total Codes: ${codeCount.rows[0].count}`);
    console.log(`Theme-Subtheme Links: ${themeSubthemeLinks.rows[0].count}`);
    console.log(`Article-Subtheme Links: ${articleSubthemeLinks.rows[0].count}`);
    console.log(`Article-Code Links: ${articleCodeLinks.rows[0].count}\n`);

    // Show thematic analysis structure
    console.log('=== THEMATIC ANALYSIS STRUCTURE ===');
    
    const themesQuery = `
      SELECT t.id, t.name as theme_name, t.description as theme_desc
      FROM themes t
      ORDER BY t.name
      LIMIT 10
    `;
    
    const themes = await client.query(themesQuery);
    
    for (const theme of themes.rows) {
      console.log(`\nTheme: ${theme.theme_name}`);
      console.log(`Description: ${theme.theme_desc}`);
      
      // Get subthemes for this theme
      const subthemesQuery = `
        SELECT s.id, s.name as subtheme_name
        FROM subthemes s
        JOIN theme_subthemes ts ON s.id = ts.subtheme_id
        WHERE ts.theme_id = $1
        ORDER BY s.name
      `;
      
      const subthemes = await client.query(subthemesQuery, [theme.id]);
      
      if (subthemes.rows.length > 0) {
        console.log('Sub-themes:');
        
        for (const subtheme of subthemes.rows) {
          // Get codes for this subtheme (from papers that reference both)
          const codesQuery = `
            SELECT DISTINCT c.name as code_name,
                   array_agg(DISTINCT rr.reference_number ORDER BY rr.reference_number) as references
            FROM codes c
            JOIN article_codes ac ON c.id = ac.code_id
            JOIN research_results rr ON ac.article_id = rr.id
            WHERE ac.subtheme_id = $1
            GROUP BY c.id, c.name
            ORDER BY c.name
            LIMIT 10
          `;
          
          const codes = await client.query(codesQuery, [subtheme.id]);
          
          console.log(`  • ${subtheme.subtheme_name}`);
          
          if (codes.rows.length > 0) {
            console.log(`    Codes:`);
            for (const code of codes.rows) {
              const refs = code.references.filter(r => r !== null).map(r => `[${r}]`).join(', ');
              console.log(`      - "${code.code_name}" ${refs}`);
            }
          } else {
            console.log(`    Codes: None found`);
          }
        }
      } else {
        console.log('Sub-themes: None');
      }
    }

    // Show sample articles with their themes, sub-themes, and codes
    const articlesQuery = `
      SELECT r.paper_title, r.authors, r.year, r.reference_number,
             array_agg(DISTINCT t.name) as themes,
             array_agg(DISTINCT s.name) as subthemes,
             array_agg(DISTINCT c.name) as codes
      FROM research_results r
      LEFT JOIN article_subthemes asub ON r.id = asub.article_id
      LEFT JOIN subthemes s ON asub.subtheme_id = s.id
      LEFT JOIN theme_subthemes ts ON s.id = ts.subtheme_id
      LEFT JOIN themes t ON ts.theme_id = t.id
      LEFT JOIN article_codes ac ON r.id = ac.article_id
      LEFT JOIN codes c ON ac.code_id = c.id
      GROUP BY r.id, r.paper_title, r.authors, r.year, r.reference_number
      ORDER BY r.reference_number
      LIMIT 5
    `;

    const articles = await client.query(articlesQuery);
    console.log('\n\n=== SAMPLE ARTICLES WITH THEMATIC ANALYSIS ===');
    articles.rows.forEach(row => {
      console.log(`\n[${row.reference_number}] ${row.paper_title}`);
      console.log(`Authors: ${row.authors}`);
      console.log(`Year: ${row.year}`);
      
      const themes = row.themes.filter(t => t !== null);
      const subthemes = row.subthemes.filter(s => s !== null);
      const codes = row.codes.filter(c => c !== null);
      
      if (themes.length > 0) {
        console.log(`Themes: ${[...new Set(themes)].join(', ')}`);
      }
      if (subthemes.length > 0) {
        console.log(`Sub-themes: ${[...new Set(subthemes)].join(', ')}`);
      }
      if (codes.length > 0) {
        console.log(`Codes: ${[...new Set(codes)].map(c => `"${c}"`).join(', ')}`);
      }
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

viewResults();
