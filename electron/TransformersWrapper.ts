// TransformersWrapper.ts - Dynamic import wrapper for @xenova/transformers
export class TransformersWrapper {
  private static transformersModule: any = null
  
  public static async initialize(): Promise<void> {
    if (!this.transformersModule) {
      try {
        // Dynamic import to handle ES Module
        this.transformersModule = await import('@xenova/transformers')
      } catch (error) {
        console.error('Failed to load transformers module:', error)
        throw error
      }
    }
  }
  
  public static async pipeline(task: string, model: string, options?: any): Promise<any> {
    await this.initialize()
    return this.transformersModule.pipeline(task, model, options)
  }
}