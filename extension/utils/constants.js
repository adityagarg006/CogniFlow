const COGNIFLOW_CONFIG = {

  // BACKEND CONNECTION
  BACKEND_URL: "http://localhost:8000",
  API_TIMEOUT_MS: 10000,
  BATCH_DELAY_MS: 800,      
  MAX_BATCH_SIZE: 20,          
  MAX_AUTO_SIMPLIFY: 5,        
                              
  RETRY_ATTEMPTS: 2,

  // SENSING LAYER
  SCROLL_SAMPLE_INTERVAL_MS: 150,
  DWELL_CHECK_INTERVAL_MS: 500,
  MOUSE_ENTROPY_WINDOW_MS: 2000,
  TAB_SWITCH_DECAY_SECONDS: 30,
  SENSING_WARMUP_MS: 3000,    

  // FLESCH-KINCAID THRESHOLDS
  FK_THRESHOLD: {
    adhd: 8,
    autism: 10,
    dyslexia: 6,
    default: 9
  },

  // SCORING WEIGHTS
  SCORE_WEIGHTS: {
    adhd: {
      textComplexity: 0.20,
      visualDensity: 0.15,
      contextualNoise: 0.40,   
      interactionCost: 0.25
    },
    autism: {
      textComplexity: 0.20,
      visualDensity: 0.40,    
      contextualNoise: 0.20,
      interactionCost: 0.20
    },
    dyslexia: {
      textComplexity: 0.45,   
      visualDensity: 0.15,
      contextualNoise: 0.20,
      interactionCost: 0.20
    },
    default: {
      textComplexity: 0.25,
      visualDensity: 0.25,
      contextualNoise: 0.25,
      interactionCost: 0.25
    }
  },

  // CAS SCORE
  CAS_INTERVENTION_THRESHOLD: 45,  
  CAS_WARNING_THRESHOLD: 65,    

  // TIER 1
  TIER1: {
    VIEWPORT_COVER_THRESHOLD: 0.25,  
    ZINDEX_THRESHOLD: 100,
    AD_SELECTORS: [
      // AD SENSOR
      'ins.adsbygoogle',
      '[id^="div-gpt-ad"]',              
      '[id^="google_ads"]',
      '[data-google-query-id]',
      '[data-ad-slot]',
      '[data-ad-client]',
      '[data-ad-format]',
      'iframe[src*="doubleclick.net"]',
      'iframe[src*="googlesyndication.com"]',
      'iframe[src*="googleadservices.com"]',
      'iframe[src*="google.com/pagead"]',

      '[id^="taboola-"]',               
      '[class^="taboola"]',
      '.taboola-container',
      '[id^="outbrain"]',               
      '[class^="outbrain"]',
      '.OUTBRAIN',
      '[data-widget-id*="outbrain"]',
      '[id^="mgid"]',                    
      '.mgbox',
      '[id^="colombai"]',               
      '[id^="rcjsload"]',                

      'iframe[src*="amazon-adsystem"]',
      '[class^="amzn-native"]',

      '.ad-container', '.ad_container', '.adContainer',
      '.ad-wrapper', '.ad_wrapper', '.adWrapper',
      '.ad-slot', '.ad_slot', '.adSlot',
      '.ad-unit', '.ad_unit', '.adUnit',
      '.ad-block', '.ad_block', '.adBlock',
      '.ad-box', '.ad_box', '.adBox',
      '.ad-widget', '.ad_widget', '.adWidget',
      '.ad-banner', '.ad_banner', '.adBanner',
      '.ad-placement', '.ad_placement',
      '.ads-container', '.ads_container',
      '.ads-wrapper', '.ads_wrapper',
      '.advert', '.advertisement',
      '.sponsor-box', '.sponsored-content', '.sponsored_content',
      '.promoted-content', '.promoted_content',
      '.promo-box', '.promo_box',

      '[aria-label="advertisement"]',
      '[aria-label="Advertisement"]',
      '[aria-label="Sponsored"]',

      '#ad-container', '#ad_container',
      '#ad-wrapper', '#ad_wrapper',
      '#advertisement',

      '[id^="izooto"]',                 
      '[class^="izooto"]',
      '.colombiaonline',
      '[id^="vidoomy"]',                
      '[data-adbridg]',                
    ],
    URGENCY_PATTERNS: [
      /only \d+ left/i, /limited time/i, /offer expires/i,
      /hurry/i, /act now/i, /don't miss/i, /last chance/i,
      /selling fast/i, /almost gone/i, /ends (today|tonight|soon)/i,
      /\d+:\d+:\d+/, 
      /\d+% off.*(today|now|limited)/i
    ],
    COOKIE_SELECTORS: [
      '[class*="cookie"]', '[id*="cookie"]',
      '[class*="consent"]', '[id*="consent"]',
      '[class*="gdpr"]', '[id*="gdpr"]',
      '[class*="privacy-notice"]', '[class*="cc-"]'
    ]
  },

  // TIER 2
  TIER2: {
    DENSITY_THRESHOLD: 0.8,
    MAX_NAV_LINKS: 25,
    COLOR_VARIANCE_THRESHOLD: 80,
    MIN_PARAGRAPH_LENGTH: 40,
    MAX_PARAGRAPH_WORDS_ADHD: 80,
    ANIMATION_SPEED_THRESHOLD: 500
  },

  // PROGRESSIVE DISCLOSURE
  DISCLOSURE: {
    SHOW_ORIGINAL_LABEL: "Show original",
    SHOW_SIMPLIFIED_LABEL: "Simplified by CogniFlow",
    TLDR_LABEL: "TL;DR",
    ANIMATION_DURATION_MS: 200
  },

  // LEARNING LAYER
  LEARNING: {
    STORAGE_KEY: "cogniflow_learning_data",
    MAX_DOMAIN_ENTRIES: 100,
    EXPANSION_THRESHOLD: 0.6,
    MIN_SAMPLES_FOR_LEARNING: 5,
    DECAY_FACTOR: 0.95
  },

  // PROFILES DECLARATION
  PROFILES: {
    adhd: {
      label: "ADHD",
      description: "Strips distractions, urgency, and summarizes dense text",
      color: "#7F77DD",
      cssClass: "cogniflow-adhd"
    },
    autism: {
      label: "Autism",
      description: "Blocks pop-ups, mutes autoplay, calms aggressive visuals",
      color: "#1D9E75",
      cssClass: "cogniflow-autism"
    },
    dyslexia: {
      label: "Dyslexia",
      description: "Dyslexia-friendly fonts, spacing, simplified prose",
      color: "#D85A30",
      cssClass: "cogniflow-dyslexia"
    }
  }
};

if (typeof window !== "undefined") {
  window.COGNIFLOW_CONFIG = COGNIFLOW_CONFIG;
}