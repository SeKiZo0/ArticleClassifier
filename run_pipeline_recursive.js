import { spawn } from 'child_process';

async function runScript(scriptName, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ${description}`);
  console.log(`${'='.repeat(60)}\n`);
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptName], {
      stdio: 'inherit', // This streams output in real-time
      shell: true,
      cwd: process.cwd()
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${description} completed successfully\n`);
        resolve();
      } else {
        console.error(`\n❌ ${description} failed with exit code ${code}\n`);
        reject(new Error(`Script ${scriptName} failed with exit code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      console.error(`\n❌ Error running ${scriptName}:`, error.message);
      reject(error);
    });
  });
}

async function runFullPipelineRecursive() {
  const startTime = Date.now();
  
  console.log('🔄 Starting Enhanced Research Paper Analysis Pipeline');
  console.log('🔄 With Recursive Theme/Subtheme Consolidation');
  console.log(`📅 Started at: ${new Date().toLocaleString()}`);
  
  try {
    // Step 1: Analyze papers and extract themes/subthemes
    await runScript('analyze_papers.js', 'STEP 1: Analyzing Research Papers');
    
    // Small delay to ensure database operations are complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Recursively consolidate similar themes and subthemes
    await runScript('consolidate_recursive.js', 'STEP 2: Recursive Consolidation of Themes & Subthemes');
    
    // Small delay before viewing results
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 3: Display final results
    await runScript('view_results.js', 'STEP 3: Displaying Final Results');
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('🎉 ENHANCED PIPELINE COMPLETED SUCCESSFULLY!');
    console.log(`${'='.repeat(60)}`);
    console.log(`⏱️  Total execution time: ${duration} seconds`);
    console.log(`📅 Completed at: ${new Date().toLocaleString()}`);
    console.log('\n📊 The research papers have been analyzed with maximum consolidation!');
    console.log('\n💡 Features used:');
    console.log('   ✅ AI-powered paper analysis with function calling');
    console.log('   ✅ Recursive theme consolidation until no more merges possible');
    console.log('   ✅ Chunked processing for handling large datasets');
    console.log('   ✅ Database integrity maintained throughout');
    console.log('\n🎯 Next steps:');
    console.log('   • Review the highly consolidated themes and subthemes');
    console.log('   • Query the database for specific insights');
    console.log('   • Add more papers and run the pipeline again');
    
  } catch (error) {
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('❌ ENHANCED PIPELINE FAILED');
    console.log(`${'='.repeat(60)}`);
    console.log(`⏱️  Execution time before failure: ${duration} seconds`);
    console.log(`📅 Failed at: ${new Date().toLocaleString()}`);
    console.log(`🔍 Error: ${error.message}`);
    console.log('\n🛠️  Troubleshooting tips:');
    console.log('   • Check your database connection in credentials.js');
    console.log('   • Verify your GEMINI_API_KEY is valid');
    console.log('   • Ensure PDF files are accessible in Research Papers/ folder');
    console.log('   • Check for any missing dependencies');
    console.log('   • Monitor API rate limits during recursive consolidation');
    
    process.exit(1);
  }
}

// Handle process interruption gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Enhanced pipeline interrupted by user');
  console.log('📋 Current progress may be partially saved in database');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Enhanced pipeline terminated');
  process.exit(0);
});

// Start the enhanced pipeline
runFullPipelineRecursive();
