import { PG_CONFIG, GEMINI_API_KEY } from './credentials.js';
import { Client } from 'pg';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const client = new Client(PG_CONFIG);

// Try to load the real Google GenAI client
let realAI = null;
try {
  const { GoogleGenAI } = await import('@google/genai');
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is missing in credentials.js. Exiting.');
    process.exit(1);
  }
  realAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  console.log('Using real @google/genai client.');
} catch (err) {
  console.error('Failed to load @google/genai client. Error:', err && err.message ? err.message : err);
  process.exit(1);
}

// Function declaration for theme consolidation
const consolidateThemesFunctionDeclaration = {
  name: 'consolidate_themes',
  description: 'Identify groups of similar themes that should be merged together',
  parameters: {
    type: 'object',
    properties: {
      consolidation_groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            primary_theme: {
              type: 'object',
              properties: {
                id: { type: 'integer', description: 'ID of the theme to keep as primary' },
                name: { type: 'string', description: 'Name of the primary theme' },
                description: { type: 'string', description: 'Consolidated description for the primary theme' }
              }
            },
            themes_to_merge: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer', description: 'ID of theme to merge into primary' },
                  name: { type: 'string', description: 'Name of theme to merge' }
                }
              },
              description: 'List of similar themes to merge into the primary theme'
            },
            justification: { type: 'string', description: 'Reason why these themes should be merged' }
          }
        },
        description: 'Groups of similar themes that should be consolidated'
      }
    },
    required: ['consolidation_groups'],
  },
};

// Function declaration for subtheme consolidation
const consolidateSubthemesFunctionDeclaration = {
  name: 'consolidate_subthemes',
  description: 'Identify groups of similar subthemes that should be merged together',
  parameters: {
    type: 'object',
    properties: {
      consolidation_groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            primary_subtheme: {
              type: 'object',
              properties: {
                id: { type: 'integer', description: 'ID of the subtheme to keep as primary' },
                name: { type: 'string', description: 'Name of the primary subtheme' },
                description: { type: 'string', description: 'Consolidated description for the primary subtheme' }
              }
            },
            subthemes_to_merge: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer', description: 'ID of subtheme to merge into primary' },
                  name: { type: 'string', description: 'Name of subtheme to merge' }
                }
              },
              description: 'List of similar subthemes to merge into the primary subtheme'
            },
            justification: { type: 'string', description: 'Reason why these subthemes should be merged' }
          }
        },
        description: 'Groups of similar subthemes that should be consolidated'
      }
    },
    required: ['consolidation_groups'],
  },
};

async function callGeminiForThemes(themesData, iterationNumber, chunkNumber = null) {
  try {
    const chunkInfo = chunkNumber ? ` (chunk ${chunkNumber})` : '';
    const prompt = `ITERATION ${iterationNumber}${chunkInfo}: Analyze the following themes and identify groups of similar themes that should be merged together. Look for:
1. Themes with very similar meanings (e.g., "Software Development" and "Software Engineering")
2. Themes where one is a subset of another (e.g., "Vulnerability" and "Vulnerability Detection")
3. Themes with different wording but same concept (e.g., "Code Quality" and "Software Quality")
4. Themes that are variations of the same core concept
5. Themes that could be logically grouped under a broader category

For each group, choose the most comprehensive and clear theme as the primary, and list the others to merge into it.
Be aggressive in consolidation - it's better to merge similar concepts than to keep them separate.

Themes to analyze:
${themesData.map(t => `ID: ${t.id}, Name: "${t.name}", Description: "${t.description || 'No description'}"`).join('\n')}`;

    const response = await realAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{
          functionDeclarations: [consolidateThemesFunctionDeclaration]
        }],
      },
    });
    return response;
  } catch (err) {
    throw new Error(`Gemini API error: ${err && err.message ? err.message : err}`);
  }
}

async function callGeminiForSubthemes(subthemesData, iterationNumber, chunkNumber) {
  try {
    const prompt = `ITERATION ${iterationNumber} - CHUNK ${chunkNumber}: Analyze the following subthemes and identify groups of similar subthemes that should be merged together. Look for:
1. Subthemes with very similar meanings
2. Subthemes where one is a subset or extension of another
3. Subthemes with different wording but same concept
4. Subthemes that are variations of the same core concept
5. Subthemes that could be logically grouped under a broader category

For each group, choose the most comprehensive and clear subtheme as the primary, and list the others to merge into it.
Be aggressive in consolidation - it's better to merge similar concepts than to keep them separate.

Subthemes to analyze:
${subthemesData.map(s => `ID: ${s.id}, Name: "${s.name}", Description: "${s.description || 'No description'}"`).join('\n')}`;

    const response = await realAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{
          functionDeclarations: [consolidateSubthemesFunctionDeclaration]
        }],
      },
    });
    return response;
  } catch (err) {
    throw new Error(`Gemini API error: ${err && err.message ? err.message : err}`);
  }
}

async function mergeThemes(consolidationGroups) {
  let mergeCount = 0;
  
  for (const group of consolidationGroups) {
    const { primary_theme, themes_to_merge, justification } = group;
    
    if (!themes_to_merge || themes_to_merge.length === 0) continue;
    
    console.log(`\n🔄 Merging themes into "${primary_theme.name}": ${themes_to_merge.map(t => t.name).join(', ')}`);
    console.log(`📝 Justification: ${justification}`);
    
    await client.query('BEGIN');
    
    try {
      // Update the primary theme's description
      await client.query(
        'UPDATE themes SET description = $1 WHERE id = $2',
        [primary_theme.description, primary_theme.id]
      );
      
      for (const themeToMerge of themes_to_merge) {
        // Update all theme_subthemes references to point to primary theme
        await client.query(
          'UPDATE theme_subthemes SET theme_id = $1 WHERE theme_id = $2 AND NOT EXISTS (SELECT 1 FROM theme_subthemes WHERE theme_id = $1 AND subtheme_id = theme_subthemes.subtheme_id)',
          [primary_theme.id, themeToMerge.id]
        );
        
        // Delete duplicate theme_subthemes entries
        await client.query(
          'DELETE FROM theme_subthemes WHERE theme_id = $1',
          [themeToMerge.id]
        );
        
        // Delete the merged theme
        await client.query('DELETE FROM themes WHERE id = $1', [themeToMerge.id]);
        
        console.log(`  ✅ Merged theme "${themeToMerge.name}" (ID: ${themeToMerge.id})`);
        mergeCount++;
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Error merging themes for group "${primary_theme.name}":`, err.message);
    }
  }
  
  return mergeCount;
}

async function mergeSubthemes(consolidationGroups) {
  let mergeCount = 0;
  
  for (const group of consolidationGroups) {
    const { primary_subtheme, subthemes_to_merge, justification } = group;
    
    if (!subthemes_to_merge || subthemes_to_merge.length === 0) continue;
    
    console.log(`\n🔄 Merging subthemes into "${primary_subtheme.name}": ${subthemes_to_merge.map(s => s.name).join(', ')}`);
    console.log(`📝 Justification: ${justification}`);
    
    await client.query('BEGIN');
    
    try {
      // Update the primary subtheme's description
      await client.query(
        'UPDATE subthemes SET description = $1 WHERE id = $2',
        [primary_subtheme.description, primary_subtheme.id]
      );
      
      for (const subthemeToMerge of subthemes_to_merge) {
        // Update all theme_subthemes references to point to primary subtheme
        await client.query(
          'UPDATE theme_subthemes SET subtheme_id = $1 WHERE subtheme_id = $2 AND NOT EXISTS (SELECT 1 FROM theme_subthemes WHERE theme_id = theme_subthemes.theme_id AND subtheme_id = $1)',
          [primary_subtheme.id, subthemeToMerge.id]
        );
        
        // Update all article_subthemes references to point to primary subtheme
        await client.query(
          'UPDATE article_subthemes SET subtheme_id = $1 WHERE subtheme_id = $2 AND NOT EXISTS (SELECT 1 FROM article_subthemes WHERE article_id = article_subthemes.article_id AND subtheme_id = $1)',
          [primary_subtheme.id, subthemeToMerge.id]
        );
        
        // Delete duplicate entries
        await client.query('DELETE FROM theme_subthemes WHERE subtheme_id = $1', [subthemeToMerge.id]);
        await client.query('DELETE FROM article_subthemes WHERE subtheme_id = $1', [subthemeToMerge.id]);
        
        // Delete the merged subtheme
        await client.query('DELETE FROM subthemes WHERE id = $1', [subthemeToMerge.id]);
        
        console.log(`  ✅ Merged subtheme "${subthemeToMerge.name}" (ID: ${subthemeToMerge.id})`);
        mergeCount++;
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Error merging subthemes for group "${primary_subtheme.name}":`, err.message);
    }
  }
  
  return mergeCount;
}

async function consolidateThemesRecursively() {
  let iterationNumber = 1;
  let totalThemesMerged = 0;
  const THEME_CHUNK_SIZE = 30; // Smaller chunks for themes
  
  while (true) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🔄 THEME CONSOLIDATION - ITERATION ${iterationNumber}`);
    console.log(`${'═'.repeat(80)}`);
    
    const themesResult = await client.query('SELECT id, name, description FROM themes ORDER BY name');
    const themes = themesResult.rows;
    
    if (themes.length <= 1) {
      console.log('📝 Only one or no themes remaining. Consolidation complete.');
      break;
    }
    
    console.log(`📊 Current themes: ${themes.length}`);
    
    let iterationMerges = 0;
    
    // Process themes in chunks
    for (let i = 0; i < themes.length; i += THEME_CHUNK_SIZE) {
      const chunk = themes.slice(i, i + THEME_CHUNK_SIZE);
      const chunkNumber = Math.floor(i / THEME_CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(themes.length / THEME_CHUNK_SIZE);
      
      if (totalChunks > 1) {
        console.log(`\n📦 Processing theme chunk ${chunkNumber}/${totalChunks} (${chunk.length} themes)...`);
      }
      
      try {
        const themesResponse = await callGeminiForThemes(chunk, iterationNumber, totalChunks > 1 ? chunkNumber : null);
        
        if (themesResponse && themesResponse.functionCalls && themesResponse.functionCalls.length > 0) {
          const functionCall = themesResponse.functionCalls[0];
          if (functionCall && functionCall.name === 'consolidate_themes') {
            const { consolidation_groups } = functionCall.args || {};
            if (consolidation_groups && consolidation_groups.length > 0) {
              const mergedCount = await mergeThemes(consolidation_groups);
              iterationMerges += mergedCount;
              console.log(`✅ Merged ${mergedCount} themes in this chunk`);
            } else {
              console.log('📝 No theme consolidation groups identified in this chunk');
            }
          }
        } else {
          console.log('📝 No function call found for themes in this chunk');
        }
        
        // Rate limiting between chunks
        if (i + THEME_CHUNK_SIZE < themes.length) {
          console.log('⏳ Waiting 3 seconds before next chunk...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.error(`❌ Error processing theme chunk ${chunkNumber}:`, error.message);
      }
    }
    
    totalThemesMerged += iterationMerges;
    
    if (iterationMerges === 0) {
      console.log('🎯 No more theme consolidations possible. Moving to next step.');
      break;
    }
    
    console.log(`📊 Iteration ${iterationNumber} complete: ${iterationMerges} themes merged`);
    iterationNumber++;
    
    // Brief pause between iterations
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return totalThemesMerged;
}

async function consolidateSubthemesRecursively() {
  let iterationNumber = 1;
  let totalSubthemesMerged = 0;
  const SUBTHEME_CHUNK_SIZE = 40; // Manageable chunk size for subthemes
  
  while (true) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🔄 SUBTHEME CONSOLIDATION - ITERATION ${iterationNumber}`);
    console.log(`${'═'.repeat(80)}`);
    
    const subthemesResult = await client.query('SELECT id, name, description FROM subthemes ORDER BY name');
    const subthemes = subthemesResult.rows;
    
    if (subthemes.length <= 1) {
      console.log('📝 Only one or no subthemes remaining. Consolidation complete.');
      break;
    }
    
    console.log(`📊 Current subthemes: ${subthemes.length}`);
    
    let iterationMerges = 0;
    
    // Process subthemes in chunks
    for (let i = 0; i < subthemes.length; i += SUBTHEME_CHUNK_SIZE) {
      const chunk = subthemes.slice(i, i + SUBTHEME_CHUNK_SIZE);
      const chunkNumber = Math.floor(i / SUBTHEME_CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(subthemes.length / SUBTHEME_CHUNK_SIZE);
      
      console.log(`\n📦 Processing subtheme chunk ${chunkNumber}/${totalChunks} (${chunk.length} subthemes)...`);
      
      try {
        const subthemesResponse = await callGeminiForSubthemes(chunk, iterationNumber, chunkNumber);
        
        if (subthemesResponse && subthemesResponse.functionCalls && subthemesResponse.functionCalls.length > 0) {
          const functionCall = subthemesResponse.functionCalls[0];
          if (functionCall && functionCall.name === 'consolidate_subthemes') {
            const { consolidation_groups } = functionCall.args || {};
            if (consolidation_groups && consolidation_groups.length > 0) {
              const mergedCount = await mergeSubthemes(consolidation_groups);
              iterationMerges += mergedCount;
              console.log(`✅ Merged ${mergedCount} subthemes in this chunk`);
            } else {
              console.log('📝 No subtheme consolidation groups identified in this chunk');
            }
          }
        } else {
          console.log('📝 No function call found for subthemes in this chunk');
        }
        
        // Rate limiting between chunks
        if (i + SUBTHEME_CHUNK_SIZE < subthemes.length) {
          console.log('⏳ Waiting 3 seconds before next chunk...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        console.error(`❌ Error processing subtheme chunk ${chunkNumber}:`, error.message);
      }
    }
    
    totalSubthemesMerged += iterationMerges;
    
    if (iterationMerges === 0) {
      console.log('🎯 No more subtheme consolidations possible. Moving to next step.');
      break;
    }
    
    console.log(`📊 Iteration ${iterationNumber} complete: ${iterationMerges} subthemes merged`);
    iterationNumber++;
    
    // Brief pause between iterations
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return totalSubthemesMerged;
}

async function recursiveConsolidation() {
  try {
    await client.connect();
    console.log('✅ Connected to database for recursive consolidation...\n');

    // Get initial counts
    const beforeThemes = await client.query('SELECT COUNT(*) FROM themes');
    const beforeSubthemes = await client.query('SELECT COUNT(*) FROM subthemes');
    
    console.log(`📊 INITIAL STATE:`);
    console.log(`   • Themes: ${beforeThemes.rows[0].count}`);
    console.log(`   • Subthemes: ${beforeSubthemes.rows[0].count}`);

    // Step 1: Recursively consolidate themes
    console.log(`\n🎯 Starting recursive theme consolidation...`);
    const totalThemesMerged = await consolidateThemesRecursively();

    // Step 2: Recursively consolidate subthemes
    console.log(`\n🎯 Starting recursive subtheme consolidation...`);
    const totalSubthemesMerged = await consolidateSubthemesRecursively();

    // Show final counts
    const afterThemes = await client.query('SELECT COUNT(*) FROM themes');
    const afterSubthemes = await client.query('SELECT COUNT(*) FROM subthemes');
    
    console.log(`\n${'═'.repeat(80)}`);
    console.log('🎉 RECURSIVE CONSOLIDATION COMPLETE!');
    console.log(`${'═'.repeat(80)}`);
    console.log(`📊 FINAL RESULTS:`);
    console.log(`   • Themes: ${beforeThemes.rows[0].count} → ${afterThemes.rows[0].count} (reduced by ${beforeThemes.rows[0].count - afterThemes.rows[0].count})`);
    console.log(`   • Subthemes: ${beforeSubthemes.rows[0].count} → ${afterSubthemes.rows[0].count} (reduced by ${beforeSubthemes.rows[0].count - afterSubthemes.rows[0].count})`);
    console.log(`\n🔄 CONSOLIDATION SUMMARY:`);
    console.log(`   • Total themes merged: ${totalThemesMerged}`);
    console.log(`   • Total subthemes merged: ${totalSubthemesMerged}`);
    console.log(`   • Total items consolidated: ${totalThemesMerged + totalSubthemesMerged}`);

  } catch (err) {
    console.error('❌ Error during recursive consolidation:', err);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed.');
  }
}

recursiveConsolidation();
