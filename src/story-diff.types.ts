/**
 * Public type definitions for Story Diff
 */

export type Viewport = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
};

export type BrowserProvider = 'puppeteer' | 'playwright';

export type PlaywrightBrowserName = 'chromium' | 'firefox' | 'webkit';

export type BrowserConfig = {
  /** Browser automation provider. Default: 'puppeteer'. */
  readonly provider?: BrowserProvider;
  /** Playwright-only browser engine. Default: 'chromium'. */
  readonly browserName?: PlaywrightBrowserName;
  /** Playwright-only browser channel, e.g. 'chromium' or 'chrome'. */
  readonly channel?: string;
  /** Run browser in headless mode. Default: true. */
  readonly headless?: boolean;
  readonly args?: readonly string[];
  readonly timeout?: number;
  readonly executablePath?: string;
};

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

export type LoggerConfig = {
  /** Logging level. Default: 'silent' */
  readonly level?: LogLevel;
  /** Custom logger function. If not provided, uses console */
  readonly customLogger?: (level: LogLevel, message: string, ...args: unknown[]) => void;
};

export type ComparisonConfig = {
  /** pixelmatch threshold (0 to 1). Lower = stricter. Default: 0.1 */
  readonly threshold?: number;
  /** Acceptable diff as a percentage (0 to 100) or pixel count. Default: 0.02 */
  readonly failureThreshold?: number;
  /** Whether failureThreshold is 'percent' or 'pixel'. Default: 'percent' */
  readonly failureThresholdType?: 'percent' | 'pixel';
  /** Allow size mismatches between actual and baseline. Default: false */
  readonly allowSizeMismatch?: boolean;
};

export type StoryDiffConfig = {
  readonly storybookUrl: string;
  readonly snapshotsDir: string;
  readonly viewports?: Readonly<Record<string, Viewport>>;
  readonly browser?: BrowserConfig;
  readonly comparison?: ComparisonConfig;
  /** When true, baselines are updated instead of compared. Default: false */
  readonly update?: boolean;
  /** When true, missing baselines cause a failure. When false, they are created silently. Default: true */
  readonly failOnMissingBaseline?: boolean;
  /** Logger configuration for controlling output verbosity */
  readonly logger?: LoggerConfig;
  /** Default capture options applied to every assertion or capture unless explicitly overridden */
  readonly defaults?: CaptureOptions;
  /** Optional batch definitions used when runAll() is called without arguments */
  readonly tests?: readonly StoryVisualTest[];
};

export type CaptureOptions = {
  /** Viewport name (from config) or inline viewport dimensions */
  readonly viewport?: string | Viewport;
  /** Storybook globals to pass (e.g. { theme: 'dark' }) */
  readonly globals?: Readonly<Record<string, string>>;
  /** CSS selector to wait for before capturing */
  readonly waitForSelector?: string;
  /** Milliseconds to wait after page load before capturing */
  readonly waitForTimeout?: number;
};

export type AssertOptions = CaptureOptions & {
  readonly snapshotName: string;
  /** Optional override for comparison configuration */
  readonly comparison?: ComparisonConfig;
};

export type ComparisonResult = {
  readonly match: boolean;
  readonly diffPixels: number;
  readonly diffPercentage: number;
  readonly diffImage: Buffer | null;
  readonly baselineCreated: boolean;
  readonly baselineMissing: boolean;
  readonly snapshotPath: string;
  readonly diffPath: string | null;
};

export type StoryVisualTest = {
  readonly componentName: string;
  readonly storyPath: string;
  readonly stories: readonly string[];
  readonly viewports?: readonly string[];
  readonly globals?: Readonly<Record<string, string>>;
};

export type BatchResult = {
  readonly storyId: string;
  readonly snapshotName: string;
  readonly viewport: string;
  readonly result: ComparisonResult;
};
