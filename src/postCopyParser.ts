import { promises as fsp } from 'fs';
import { MConfigParser, MConfigNode } from './mconfigParser';

export interface PostCopyProject {
  name: string;
  destinations: string[];
}

export class PostCopyParser {
  /**
   * Parse a PostCopy.MConfig file to extract project destinations
   * Uses the proper MConfig parser to build a registry tree first
   */
  static async parse(filePath: string): Promise<Map<string, PostCopyProject>> {
    try {
      const content = await fsp.readFile(filePath, 'utf8');
      return this.parseContent(content);
    } catch (error) {
      console.error(`Error reading PostCopy.MConfig file: ${error}`);
      return new Map();
    }
  }

  static parseContent(content: string): Map<string, PostCopyProject> {
    const projects = new Map<string, PostCopyProject>();
    
    // Step 1: Parse the MConfig format into a registry tree
    const parser = new MConfigParser();
    const root = parser.parse(content);
    
    // Step 2: Extract project destinations from the registry tree
    const projectsNode = root['Projects'];
    
    if (!projectsNode || typeof projectsNode !== 'object' || Array.isArray(projectsNode))
      return projects;
    
    // Iterate through each project in the Projects node
    for (const [projectName, projectValue] of Object.entries(projectsNode)) {
      if (typeof projectValue !== 'object' || Array.isArray(projectValue) || projectValue === null)
        continue;
      
      const destinations: string[] = [];
      
      // Look for Destination entries
      // The MConfig parser now handles duplicate keys by converting them to arrays
      const destValue = (projectValue as MConfigNode)['Destination'];
      
      if (destValue !== undefined) {
        if (typeof destValue === 'string') {
          // Single destination
          destinations.push(destValue);
        } else if (Array.isArray(destValue)) {
          // Multiple destinations (duplicate keys)
          for (const dest of destValue) {
            if (typeof dest === 'string')
              destinations.push(dest);
          }
        }
      }
      
      if (destinations.length > 0) {
        projects.set(projectName, {
          name: projectName,
          destinations
        });
      }
    }
    
    return projects;
  }
}