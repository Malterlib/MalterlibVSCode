/**
 * Parser for MConfig format files (Malterlib configuration format)
 * Based on the C++ TCRegistry parser implementation
 */

export type MConfigValue = string | number | boolean | null | MConfigValue[] | MConfigNode;

export interface MConfigNode {
  [key: string]: MConfigValue;
}

export class MConfigParser {
  private pos: number = 0;
  private input: string = '';
  private line: number = 1;
  private column: number = 1;

  /**
   * Parse MConfig format string into a registry tree
   */
  parse(input: string): MConfigNode {
    this.input = input;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    
    const root: MConfigNode = {};
    this.parseScope(root);
    return root;
  }

  private parseScope(parent: MConfigNode): void {
    while (this.pos < this.input.length) {
      this.skipWhitespaceAndComments();
      
      if (this.pos >= this.input.length)
        break;
      
      const ch = this.input[this.pos];
      
      // Check for end of scope
      if (ch === '}')
        return;
      
      // Parse key
      const key = this.parseKey();
      if (!key)
        break;
      
      this.skipWhitespaceAndComments();
      
      // Check what follows the key
      const nextCh = this.input[this.pos];
      
      let value: MConfigValue;
      
      if (nextCh === '{') {
        // Child scope
        this.pos++; // consume '{'
        this.column++;
        const childNode: MConfigNode = {};
        this.parseScope(childNode);
        
        if (this.input[this.pos] === '}') {
          this.pos++; // consume '}'
          this.column++;
        }
        
        value = childNode;
      } else if (nextCh === '[') {
        // Array value
        value = this.parseArray();
      } else {
        // Single value
        value = this.parseValue();
      }
      
      // Handle duplicate keys by converting to array
      if (key in parent) {
        const existing = parent[key];
        if (Array.isArray(existing)) {
          // Already an array from duplicate keys, add to it
          existing.push(value);
        } else {
          // Convert to array with both values
          parent[key] = [existing, value];
        }
      } else {
        parent[key] = value;
      }
    }
  }

  private parseKey(): string | null {
    this.skipWhitespaceAndComments();
    
    if (this.pos >= this.input.length)
      return null;
    
    const ch = this.input[this.pos];
    
    // Check for quoted key
    if (ch === '"')
      return this.parseQuotedString();
    
    // Parse unquoted identifier
    const start = this.pos;
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      
      // Stop at whitespace, special characters, or comments
      if (/\s/.test(ch) || ch === '{' || ch === '}' || ch === '[' || ch === ']' || 
          (ch === '/' && (this.input[this.pos + 1] === '/' || this.input[this.pos + 1] === '*')))
        break;
      
      // Support backslash line continuation
      if (ch === '\\' && this.pos + 1 < this.input.length) {
        const nextCh = this.input[this.pos + 1];
        if (nextCh === '\n' || nextCh === '\r') {
          this.pos += 2;
          if (nextCh === '\r' && this.input[this.pos] === '\n')
            this.pos++;
          this.line++;
          this.column = 1;
          // Skip whitespace after line continuation
          this.skipWhitespace();
          continue;
        }
      }
      
      this.pos++;
      this.column++;
    }
    
    const key = this.input.slice(start, this.pos);
    return key || null;
  }

  private parseValue(): MConfigValue {
    this.skipWhitespaceAndComments();
    
    if (this.pos >= this.input.length)
      return null;
    
    const ch = this.input[this.pos];
    
    // Check for quoted string
    if (ch === '"')
      return this.parseQuotedString();
    
    // Check for array
    if (ch === '[')
      return this.parseArray();
    
    // Check for boolean values
    const remaining = this.input.slice(this.pos);
    if (remaining.startsWith('true')) {
      this.pos += 4;
      this.column += 4;
      return true;
    }
    if (remaining.startsWith('false')) {
      this.pos += 5;
      this.column += 5;
      return false;
    }
    if (remaining.startsWith('null')) {
      this.pos += 4;
      this.column += 4;
      return null;
    }
    
    // Parse number or unquoted string
    const start = this.pos;
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      
      // Stop at whitespace, special characters, or comments
      if (/\s/.test(ch) || ch === '{' || ch === '}' || ch === '[' || ch === ']' ||
          (ch === '/' && (this.input[this.pos + 1] === '/' || this.input[this.pos + 1] === '*')))
        break;
      
      this.pos++;
      this.column++;
    }
    
    const value = this.input.slice(start, this.pos);
    
    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num) && value !== '')
      return num;
    
    return value;
  }

  private parseArray(): MConfigValue[] {
    const arr: MConfigValue[] = [];
    
    if (this.input[this.pos] !== '[')
      throw new Error(`Expected '[' at position ${this.pos}`);
    
    this.pos++; // consume '['
    this.column++;
    
    while (this.pos < this.input.length) {
      this.skipWhitespaceAndComments();
      
      if (this.pos >= this.input.length)
        break;
      
      if (this.input[this.pos] === ']') {
        this.pos++; // consume ']'
        this.column++;
        break;
      }
      
      // Check for comma (optional separator)
      if (this.input[this.pos] === ',') {
        this.pos++;
        this.column++;
        continue;
      }
      
      const value = this.parseValue();
      if (value !== undefined)
        arr.push(value);
    }
    
    return arr;
  }

  private parseQuotedString(): string {
    if (this.input[this.pos] !== '"')
      throw new Error(`Expected '"' at position ${this.pos}`);
    
    this.pos++; // consume opening '"'
    this.column++;
    
    let result = '';
    
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      
      if (ch === '"') {
        this.pos++; // consume closing '"'
        this.column++;
        return result;
      }
      
      if (ch === '\\' && this.pos + 1 < this.input.length) {
        const nextCh = this.input[this.pos + 1];
        
        // Handle escape sequences
        switch (nextCh) {
          case 'n':
            result += '\n';
            this.pos += 2;
            this.column += 2;
            continue;
          case 'r':
            result += '\r';
            this.pos += 2;
            this.column += 2;
            continue;
          case 't':
            result += '\t';
            this.pos += 2;
            this.column += 2;
            continue;
          case '\\':
            result += '\\';
            this.pos += 2;
            this.column += 2;
            continue;
          case '"':
            result += '"';
            this.pos += 2;
            this.column += 2;
            continue;
          default:
            // If no known escape sequence, just include the backslash
            result += ch;
            this.pos++;
            this.column++;
            continue;
        }
      }
      
      if (ch === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      
      result += ch;
      this.pos++;
    }
    
    throw new Error(`Unterminated string at position ${this.pos}`);
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      
      if (!/\s/.test(ch))
        break;
      
      if (ch === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      
      this.pos++;
    }
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      
      if (this.pos >= this.input.length)
        break;
      
      // Check for line comment
      if (this.input[this.pos] === '/' && this.input[this.pos + 1] === '/') {
        this.pos += 2;
        this.column += 2;
        
        // Skip to end of line
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
          this.pos++;
          this.column++;
        }
        
        if (this.input[this.pos] === '\n') {
          this.pos++;
          this.line++;
          this.column = 1;
        }
        
        continue;
      }
      
      // Check for block comment
      if (this.input[this.pos] === '/' && this.input[this.pos + 1] === '*') {
        this.pos += 2;
        this.column += 2;
        
        // Skip to end of block comment
        while (this.pos < this.input.length - 1) {
          if (this.input[this.pos] === '*' && this.input[this.pos + 1] === '/') {
            this.pos += 2;
            this.column += 2;
            break;
          }
          
          if (this.input[this.pos] === '\n') {
            this.line++;
            this.column = 1;
          } else {
            this.column++;
          }
          
          this.pos++;
        }
        
        continue;
      }
      
      // No more whitespace or comments
      break;
    }
  }
}