import { MConfigParser } from '../mconfigParser';
import { PostCopyParser } from '../postCopyParser';

// Test the MConfig parser with a sample PostCopy.MConfig content
const testContent = `
ExcludePatterns [
  "*/.git",
  "*/.DS_Store"
]

Projects
{
  Tests
  {
    //Destination "/opt/Deploy/TestsClang15"
    Destination "/opt/Deploy/Tests"
    Destination "/opt/Deploy/Tests2"
  }

  "Tests with spaces"
  {
    //Destination "/opt/Deploy/TestsClang15"
    Destination "/opt/Deploy/Tests"
    Destination "/opt/Deploy/Tests2"
  }

  "Tests with \\\" spaces and escapes \\\\"
  {
    //Destination "/opt/Deploy/TestsClang15"
    Destination "/opt/Deploy/Tests"
    Destination "/opt/Deploy/Tests2"
  }

  MTool
  {
    Destination "/opt/Source/Malterlib2/Binaries/Malterlib/macOS/arm64"
  }

  Malterlib_All
  {
    Destination "/opt/Deploy/Malterlib_All"
  }
}

Tags []
`;

function testMConfigParser() {
  console.log('Testing MConfig Parser...\n');

  const parser = new MConfigParser();
  const root = parser.parse(testContent);

  console.log('Parsed root structure:');
  console.log(JSON.stringify(root, null, 2));

  console.log('\n\nTesting PostCopy Parser...\n');

  const projects = PostCopyParser.parseContent(testContent);

  console.log('Extracted projects:');
  for (const [name, project] of projects) {
    console.log(`\nProject: ${name}`);
    console.log('Destinations:');
    project.destinations.forEach((dest, index) => {
      console.log(`  ${index + 1}. ${dest}`);
    });
  }

  // Test direct access to project destinations
  console.log('\n\nDirect access test:');
  const testsProject = projects.get('Tests');
  if (testsProject) {
    console.log('Tests project has', testsProject.destinations.length, 'destinations');
  }
  
  const spacesProject = projects.get('Tests with spaces');
  if (spacesProject) {
    console.log('Tests with spaces project has', spacesProject.destinations.length, 'destinations');
  }
  
  const escapesProject = projects.get('Tests with " spaces and escapes \\');
  if (escapesProject) {
    console.log('Tests with escapes project has', escapesProject.destinations.length, 'destinations');
  }
}

// Run the test
testMConfigParser();