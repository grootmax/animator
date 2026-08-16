export interface ProjectData {
  scene: Record<string, any>;
  animations: any[];
  metadata?: any;
}

export class ProjectValidator {
  /**
   * Validates if the given string is valid JSON and parses it.
   */
  static parseAndValidateJSON(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Invalid JSON Syntax');
    }
  }

  /**
   * Validates if the parsed object conforms to the structural contract.
   */
  static validateStructure(data: any): data is ProjectData {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid Project Structure: Root must be an object');
    }

    if (!('scene' in data)) {
      throw new Error('Invalid Project Structure: Missing scene configuration');
    }

    if (typeof data.scene !== 'object' || data.scene === null) {
      throw new Error('Invalid Project Structure: Scene must be an object');
    }

    if (!('animations' in data)) {
      throw new Error('Invalid Project Structure: Missing animation sequences');
    }

    if (!Array.isArray(data.animations)) {
      throw new Error('Invalid Project Structure: Animations must be an array');
    }

    return true;
  }

  /**
   * Cleans internal data like localMatrix, worldMatrix, isDirty
   * before sending it to the main process.
   */
  static cleanScene(sceneNodes: Record<string, any>): Record<string, any> {
    const cleanScene: Record<string, any> = {};
    for (const [id, node] of Object.entries(sceneNodes)) {
      const cleanNode = { ...node };
      delete cleanNode.localMatrix;
      delete cleanNode.worldMatrix;
      delete cleanNode.isDirty;
      cleanScene[id] = cleanNode;
    }
    return cleanScene;
  }

  /**
   * Validates both JSON syntax and project structure.
   */
  static validateString(jsonString: string): ProjectData {
    const parsed = this.parseAndValidateJSON(jsonString);
    this.validateStructure(parsed);
    return parsed;
  }
}
