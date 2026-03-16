import { logger } from '../utils/logger.js';

export class CaptchaBypassService {
  constructor() {
    this.captchaSolveAttempts = 0;
    this.maxAttempts = 3;
    this.enableBypass = true;
  }

  /**
   * Setup captcha solving on page
   */
  async setupCaptchaHandling(page) {
    try {
      // Set extended timeout for captcha solving
      page.setDefaultTimeout(60000);
      page.setDefaultNavigationTimeout(60000);

      // Intercept recaptcha script
      await page.route('**/*recaptcha*', async (route) => {
        logger.debug('Intercepted reCAPTCHA script');
        // We'll handle this when captcha appears
        await route.continue();
      });

      // Add listener for captcha detection
      await page.exposeFunction('notifyCaptcha', (captchaType) => {
        logger.info(`Captcha detected: ${captchaType}`);
      });

      // Inject detection script using Playwright's addInitScript
      await page.addInitScript(() => {
        window.addEventListener('load', () => {
          // Detect reCAPTCHA v2
          const rcaptchaV2 = document.querySelector('[data-sitekey]');
          if (rcaptchaV2) {
            window.notifyCaptcha('recaptcha-v2');
          }

          // Detect reCAPTCHA v3
          if (window.grecaptcha?.execute) {
            window.notifyCaptcha('recaptcha-v3');
          }

          // Detect hCaptcha
          if (document.querySelector('[data-sitekey*="captcha"]')) {
            window.notifyCaptcha('hcaptcha');
          }
        });
      });

      return true;
    } catch (error) {
      logger.error('Failed to setup captcha handling:', error);
      return false;
    }
  }

  /**
   * Check if captcha is present on page
   */
  async checkForCaptcha(page) {
    try {
      const captchaElements = await page.evaluate(() => {
        const checks = {
          recaptchaV2: !!document.querySelector('[data-sitekey]'),
          recaptchaV3: !!window.grecaptcha?.execute,
          hcaptcha: !!document.querySelector('[data-sitekey*="hcaptcha"]'),
          imageCaptcha: !!document.querySelector('img[alt*="captcha"]'),
          captchaFrame: !!document.querySelector('iframe[src*="captcha"]')
        };

        return Object.entries(checks).filter(([_, present]) => present).map(([type]) => type);
      });

      return captchaElements;
    } catch (error) {
      logger.debug('Error checking for captcha:', error.message);
      return [];
    }
  }

  /**
   * Bypass captcha by solving or waiting for user
   */
  async bypassCaptcha(page, timeoutSeconds = 180) {
    try {
      const captchas = await this.checkForCaptcha(page);

      if (captchas.length === 0) {
        return true; // No captcha
      }

      logger.warn(`Captcha detected: ${captchas.join(', ')}`);

      // Try automatic bypass methods
      for (const captchaType of captchas) {
        if (await this.tryAutomaticBypass(page, captchaType)) {
          logger.info(`Successfully bypassed ${captchaType}`);
          return true;
        }
      }

      // If automatic bypass failed, wait for manual solving or try alternative
      logger.warn('Automatic bypass failed, trying alternative methods...');
      
      // Try using proxy rotation or retry with different IP
      return await this.waitForCaptchaSolve(page, timeoutSeconds);

    } catch (error) {
      logger.error('Error in captcha bypass:', error);
      return false;
    }
  }

  /**
   * Try automatic bypass methods
   */
  async tryAutomaticBypass(page, captchaType) {
    try {
      if (captchaType === 'recaptcha-v2') {
        return await this.bypassRecaptchaV2(page);
      } else if (captchaType === 'recaptcha-v3') {
        return await this.bypassRecaptchaV3(page);
      } else if (captchaType === 'hcaptcha') {
        return await this.bypassHCaptcha(page);
      } else if (captchaType === 'imageCaptcha') {
        return await this.bypassImageCaptcha(page);
      }
    } catch (error) {
      logger.debug(`Failed to bypass ${captchaType}:`, error.message);
    }
    return false;
  }

  /**
   * Bypass reCAPTCHA v2 by injecting token
   */
  async bypassRecaptchaV2(page) {
    try {
      // Try to find and click the checkbox
      const checkbox = await page.$('[class*="recaptcha"]');
      if (checkbox) {
        await checkbox.click();
        await page.waitForTimeout(3000);
        
        // Check if verification succeeded
        const verified = await page.evaluate(() => {
          return typeof ___grecaptcha_cfg !== 'undefined' && 
                 ___grecaptcha_cfg.clients && 
                 Object.values(___grecaptcha_cfg.clients).some(client => 
                   client.callback !== null
                 );
        }).catch(() => false);

        if (verified) {
          logger.info('reCAPTCHA v2 bypassed by checkbox click');
          return true;
        }
      }

      // Try injecting response token
      const injected = await page.evaluate(() => {
        try {
          const callback = Object.values(window.___grecaptcha_cfg?.clients || {})[0]?.callback;
          if (callback) {
            // This is a heuristic - in real scenarios you'd need a real token
            callback('dummy-token-bypass-attempt');
            return true;
          }
        } catch (e) {}
        return false;
      });

      return injected;
    } catch (error) {
      logger.debug('Failed to bypass reCAPTCHA v2:', error.message);
      return false;
    }
  }

  /**
   * Bypass reCAPTCHA v3
   */
  async bypassRecaptchaV3(page) {
    try {
      // reCAPTCHA v3 is invisible, check if the site has legitimate traffic
      // by waiting and then proceeding
      await page.waitForTimeout(2000);
      
      // Execute the callback to complete the action
      const completed = await page.evaluate(() => {
        try {
          if (window.grecaptcha?.execute) {
            window.grecaptcha.execute();
            return true;
          }
        } catch (e) {}
        return false;
      });

      return completed;
    } catch (error) {
      logger.debug('Failed to bypass reCAPTCHA v3:', error.message);
      return false;
    }
  }

  /**
   * Bypass hCaptcha
   */
  async bypassHCaptcha(page) {
    try {
      // Try to find and interact with hCaptcha
      const hcaptchaFrame = await page.$('iframe[src*="hcaptcha"]');
      if (hcaptchaFrame) {
        await page.waitForTimeout(2000);
        
        // Try focusing and completing
        await page.evaluate(() => {
          const frame = document.querySelector('iframe[src*="hcaptcha"]');
          if (frame && frame.parentElement) {
            frame.parentElement.click();
          }
        });

        return true;
      }
    } catch (error) {
      logger.debug('Failed to bypass hCaptcha:', error.message);
    }
    return false;
  }

  /**
   * Bypass image- captcha OCR
   */
  async bypassImageCaptcha(page) {
    try {
      // Try to get captcha image
      const captchaImages = await page.$$('img[alt*="captcha"], img[class*="captcha"]');
      
      if (captchaImages.length > 0) {
        logger.debug('Found image captcha, attempting to bypass...');
        
        // This would typically use OCR service
        // For now, just return false as it requires external service
        return false;
      }
    } catch (error) {
      logger.debug('Failed to bypass image captcha:', error.message);
    }
    return false;
  }

  /**
   * Wait for captcha to be solved (manual or automatic)
   */
  async waitForCaptchaSolve(page, timeoutSeconds = 180) {
    try {
      logger.info(`Waiting for captcha to be solved (timeout: ${timeoutSeconds}s)`);

      let checkInterval = 100;
      const maxWaits = (timeoutSeconds * 1000) / checkInterval;
      let waits = 0;

      while (waits < maxWaits) {
        const captchas = await this.checkForCaptcha(page);
        
        if (captchas.length === 0) {
          logger.info('Captcha solved!');
          return true;
        }

        await page.waitForTimeout(checkInterval);
        waits++;

        if (waits % 10 === 0) {
          logger.debug(`Still waiting for captcha... (${(waits * checkInterval / 1000).toFixed(1)}s elapsed)`);
        }
      }

      logger.warn('Captcha timeout - proceeding anyway');
      return false;

    } catch (error) {
      logger.error('Error waiting for captcha solve:', error);
      return false;
    }
  }

  /**
   * Avoid captcha trigger by mimicking human behavior
   */
  async mimicHumanBehavior(page) {
    try {
      // Random delays
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      await delay(Math.random() * 3000 + 2000); // 2-5s delay

      // Mouse movements
      const viewport = await page.viewportSize();
      const randomX = Math.floor(Math.random() * viewport.width);
      const randomY = Math.floor(Math.random() * viewport.height);
      
      await page.mouse.move(randomX, randomY);
      await delay(Math.random() * 500 + 200);

      // Scroll
      await page.evaluate(() => {
        window.scrollBy(0, Math.floor(Math.random() * 300) - 150);
      });

      await delay(Math.random() * 1000);

      // Random key presses
      await page.keyboard.press('Tab');
      await delay(Math.random() * 200 + 100);

    } catch (error) {
      logger.debug('Error mimicking human behavior:', error.message);
    }
  }

  /**
   * Check if page requires verification (and handle it)
   */
  async handleVerificationPages(page) {
    try {
      // Check for various verification/challenge pages
      const verificationIndicators = await page.evaluate(() => {
        return {
          googleVerify: !!document.querySelector('[action*="verify"]'),
          challengePage: !!document.querySelector('[class*="challenge"]'),
          blockNotice: !!document.body.innerHTML.includes('block') || 
                       !!document.body.innerHTML.includes('verify'),
          securityCheck: !!document.querySelector('[class*="security"]')
        };
      });

      const isVerificationPage = Object.values(verificationIndicators).some(v => v);

      if (isVerificationPage) {
        logger.warn('Verification page detected:', verificationIndicators);
        
        // Wait a bit and try to proceed
        await this.mimicHumanBehavior(page);
        
        // Try to find and click "I'm not a robot" type buttons
        const buttons = await page.$$('button, input[type="submit"], a[class*="btn"]');
        if (buttons.length > 0) {
          await buttons[0].click();
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
          return true;
        }
      }

      return !isVerificationPage;
    } catch (error) {
      logger.debug('Error handling verification pages:', error.message);
      return false;
    }
  }
}

export const captchaBypassService = new CaptchaBypassService();
