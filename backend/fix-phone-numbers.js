// ==================== PHONE NUMBER VALIDATION & CORRECTION SCRIPT ====================
// Is script ko alag se run karo: node fix-phone-numbers.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

// MongoDB connection
const mongoURI = 'mongodb+srv://mohitsatyarthi11_db_user:fGH17FphUoWt0B3X@cluster0.jmyra5z.mongodb.net/?appName=Cluster0';

// Channel Schema
const channelSchema = new mongoose.Schema({
  channelId: { type: String, unique: true, required: true },
  title: { type: String },
  phoneNumbers: [{ type: String }],
  contactInfo: {
    hasPhone: { type: Boolean }
  },
  country: { type: String },
  lastUpdated: { type: Date }
}, { strict: false });

const Channel = mongoose.model('Channel', channelSchema);

// ==================== COUNTRY CODES DATABASE ====================

const countryCodes = {
  // Major countries
  'US': { code: '1', name: 'United States', format: '+1 XXX XXX XXXX' },
  'CA': { code: '1', name: 'Canada', format: '+1 XXX XXX XXXX' },
  'GB': { code: '44', name: 'United Kingdom', format: '+44 XXXX XXXXXX' },
  'IN': { code: '91', name: 'India', format: '+91 XXXXX XXXXX' },
  'AU': { code: '61', name: 'Australia', format: '+61 X XXXX XXXX' },
  'DE': { code: '49', name: 'Germany', format: '+49 XXXX XXXXXXX' },
  'FR': { code: '33', name: 'France', format: '+33 X XX XX XX XX' },
  'IT': { code: '39', name: 'Italy', format: '+39 XXX XXX XXXX' },
  'ES': { code: '34', name: 'Spain', format: '+34 XXX XXX XXX' },
  'NL': { code: '31', name: 'Netherlands', format: '+31 X XXXXXXXX' },
  'BE': { code: '32', name: 'Belgium', format: '+32 XXX XX XX XX' },
  'CH': { code: '41', name: 'Switzerland', format: '+41 XX XXX XX XX' },
  'SE': { code: '46', name: 'Sweden', format: '+46 XX XXX XXXX' },
  'NO': { code: '47', name: 'Norway', format: '+47 XXX XX XXX' },
  'DK': { code: '45', name: 'Denmark', format: '+45 XX XX XX XX' },
  'FI': { code: '358', name: 'Finland', format: '+358 XX XXXXXXX' },
  'JP': { code: '81', name: 'Japan', format: '+81 XX XXXX XXXX' },
  'KR': { code: '82', name: 'South Korea', format: '+82 XX XXXX XXXX' },
  'CN': { code: '86', name: 'China', format: '+86 XXX XXXX XXXX' },
  'SG': { code: '65', name: 'Singapore', format: '+65 XXXX XXXX' },
  'MY': { code: '60', name: 'Malaysia', format: '+60 XX XXX XXXX' },
  'TH': { code: '66', name: 'Thailand', format: '+66 XX XXX XXXX' },
  'VN': { code: '84', name: 'Vietnam', format: '+84 XX XXXX XXX' },
  'PH': { code: '63', name: 'Philippines', format: '+63 XXX XXX XXXX' },
  'ID': { code: '62', name: 'Indonesia', format: '+62 XX XXXX XXXX' },
  'PK': { code: '92', name: 'Pakistan', format: '+92 XXX XXXXXXX' },
  'BD': { code: '880', name: 'Bangladesh', format: '+880 XXXX XXXXXX' },
  'LK': { code: '94', name: 'Sri Lanka', format: '+94 XX XXX XXXX' },
  'NP': { code: '977', name: 'Nepal', format: '+977 XXX XXXXXX' },
  'AE': { code: '971', name: 'UAE', format: '+971 XX XXX XXXX' },
  'SA': { code: '966', name: 'Saudi Arabia', format: '+966 XX XXX XXXX' },
  'QA': { code: '974', name: 'Qatar', format: '+974 XXX XXXX' },
  'KW': { code: '965', name: 'Kuwait', format: '+965 XXXXXXXX' },
  'BH': { code: '973', name: 'Bahrain', format: '+973 XXXX XXXX' },
  'OM': { code: '968', name: 'Oman', format: '+968 XX XXX XXX' },
  'JO': { code: '962', name: 'Jordan', format: '+962 XX XXX XXXX' },
  'LB': { code: '961', name: 'Lebanon', format: '+961 XX XXX XXX' },
  'IL': { code: '972', name: 'Israel', format: '+972 XX XXX XXXX' },
  'TR': { code: '90', name: 'Turkey', format: '+90 XXX XXX XXXX' },
  'EG': { code: '20', name: 'Egypt', format: '+20 XXX XXX XXXX' },
  'ZA': { code: '27', name: 'South Africa', format: '+27 XX XXX XXXX' },
  'NG': { code: '234', name: 'Nigeria', format: '+234 XXX XXX XXXX' },
  'KE': { code: '254', name: 'Kenya', format: '+254 XXX XXXXXX' },
  'MA': { code: '212', name: 'Morocco', format: '+212 XX XXXXXXX' },
  'DZ': { code: '213', name: 'Algeria', format: '+213 XX XXX XXXX' },
  'TN': { code: '216', name: 'Tunisia', format: '+216 XX XXX XXX' },
  'GH': { code: '233', name: 'Ghana', format: '+233 XX XXX XXXX' },
  'UG': { code: '256', name: 'Uganda', format: '+256 XXX XXXXXX' },
  'TZ': { code: '255', name: 'Tanzania', format: '+255 XXX XXX XXX' },
  'ZW': { code: '263', name: 'Zimbabwe', format: '+263 XX XXXXXX' },
  'ZM': { code: '260', name: 'Zambia', format: '+260 XX XXXXXXX' },
  'BW': { code: '267', name: 'Botswana', format: '+267 XX XXX XXX' },
  'NA': { code: '264', name: 'Namibia', format: '+264 XX XXX XXXX' },
  'MU': { code: '230', name: 'Mauritius', format: '+230 XXXX XXXX' },
  'SC': { code: '248', name: 'Seychelles', format: '+248 X XX XX XX' },
  'MV': { code: '960', name: 'Maldives', format: '+960 XXX XXXX' },
  'BR': { code: '55', name: 'Brazil', format: '+55 XX XXXXX XXXX' },
  'AR': { code: '54', name: 'Argentina', format: '+54 XX XXXX XXXX' },
  'CL': { code: '56', name: 'Chile', format: '+56 X XXXX XXXX' },
  'CO': { code: '57', name: 'Colombia', format: '+57 XXX XXXXXXX' },
  'PE': { code: '51', name: 'Peru', format: '+51 XXX XXX XXX' },
  'VE': { code: '58', name: 'Venezuela', format: '+58 XXX XXX XXXX' },
  'MX': { code: '52', name: 'Mexico', format: '+52 XXX XXX XXXX' },
  'RU': { code: '7', name: 'Russia', format: '+7 XXX XXX XX XX' },
  'UA': { code: '380', name: 'Ukraine', format: '+380 XX XXX XXXX' },
  'PL': { code: '48', name: 'Poland', format: '+48 XXX XXX XXX' },
  'CZ': { code: '420', name: 'Czech Republic', format: '+420 XXX XXX XXX' },
  'HU': { code: '36', name: 'Hungary', format: '+36 XX XXX XXXX' },
  'RO': { code: '40', name: 'Romania', format: '+40 XXX XXX XXX' },
  'BG': { code: '359', name: 'Bulgaria', format: '+359 XXX XXX XXX' },
  'GR': { code: '30', name: 'Greece', format: '+30 XXX XXX XXXX' },
  'PT': { code: '351', name: 'Portugal', format: '+351 XXX XXX XXX' },
  'AT': { code: '43', name: 'Austria', format: '+43 XXX XXXXXXX' },
  'IE': { code: '353', name: 'Ireland', format: '+353 XX XXX XXXX' },
  'NZ': { code: '64', name: 'New Zealand', format: '+64 XX XXX XXXX' }
};

// ==================== PHONE VALIDATION FUNCTIONS ====================

class PhoneValidator {
  constructor() {
    this.stats = {
      totalProcessed: 0,
      totalPhones: 0,
      validPhones: 0,
      correctedPhones: 0,
      invalidPhones: 0,
      countryStats: {}
    };
  }

  // Clean phone number (remove special characters)
  cleanPhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return null;
    
    // Remove all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Ensure + is only at the beginning
    if (cleaned.includes('+')) {
      const plusCount = (cleaned.match(/\+/g) || []).length;
      if (plusCount > 1) return null;
      if (!cleaned.startsWith('+')) return null;
    }
    
    return cleaned;
  }

  // Extract digits from phone number
  extractDigits(phone) {
    return phone.replace(/\D/g, '');
  }

  // Detect country from number pattern
  detectCountryFromNumber(digits) {
    // Try to match with known country codes
    for (const [country, data] of Object.entries(countryCodes)) {
      const code = data.code;
      if (digits.startsWith(code)) {
        return country;
      }
    }
    return null;
  }

  // Validate Indian phone number
  validateIndianNumber(digits) {
    // Indian numbers: 10 digits (after +91)
    // Mobile: starts with 6,7,8,9
    // Landline: various prefixes
    
    if (digits.length === 10) {
      // Mobile number check
      if (/^[6-9]/.test(digits)) {
        return true;
      }
      // Landline check (some common prefixes)
      if (/^(011|022|033|044|080|020|040)/.test(digits)) {
        return true;
      }
    } else if (digits.length === 12 && digits.startsWith('91')) {
      // Number with country code but no +
      return this.validateIndianNumber(digits.substring(2));
    } else if (digits.length === 11 && digits.startsWith('0')) {
      // Number with leading 0
      return this.validateIndianNumber(digits.substring(1));
    }
    
    return false;
  }

  // Validate US/Canada number
  validateUSNumber(digits) {
    // US numbers: 10 digits (after +1)
    if (digits.length === 10) {
      // Area code should start with 2-9
      if (/^[2-9]/.test(digits)) {
        return true;
      }
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return this.validateUSNumber(digits.substring(1));
    }
    return false;
  }

  // Validate UK number
  validateUKNumber(digits) {
    // UK numbers: 10 digits (after +44)
    if (digits.length === 10) {
      // Mobile: starts with 7
      // Landline: various
      if (/^[7]/.test(digits) || /^[12][0-9]/.test(digits)) {
        return true;
      }
    } else if (digits.length === 11 && digits.startsWith('0')) {
      return this.validateUKNumber(digits.substring(1));
    }
    return false;
  }

  // Validate generic international number
  validateInternationalNumber(digits, countryCode) {
    const country = countryCodes[countryCode];
    if (!country) return false;
    
    const code = country.code;
    const expectedLength = country.expectedLength || 10;
    
    // Remove country code if present
    if (digits.startsWith(code)) {
      const localDigits = digits.substring(code.length);
      return localDigits.length >= 8 && localDigits.length <= 12;
    }
    
    return false;
  }

  // Format phone number with country code
  formatPhoneNumber(phone, detectedCountry = null) {
    if (!phone) return null;
    
    const cleaned = this.cleanPhoneNumber(phone);
    if (!cleaned) return null;
    
    const digits = this.extractDigits(cleaned);
    if (digits.length < 10 || digits.length > 15) return null;
    
    // Check if already has + and proper format
    if (cleaned.startsWith('+')) {
      // Already has country code, validate it
      for (const [country, data] of Object.entries(countryCodes)) {
        if (digits.startsWith(data.code)) {
          return `+${digits}`;
        }
      }
    }
    
    // Try to detect country from number pattern
    let country = detectedCountry;
    if (!country) {
      // Try to detect from digits
      if (digits.length === 10) {
        // Check if it's Indian (starts with 6-9)
        if (/^[6-9]/.test(digits)) {
          country = 'IN';
        }
        // Check if it's US (starts with 2-9)
        else if (/^[2-9]/.test(digits)) {
          country = 'US';
        }
      } else if (digits.length === 11 && digits.startsWith('0')) {
        // Leading zero - could be many countries
        const withoutZero = digits.substring(1);
        if (/^[6-9]/.test(withoutZero)) {
          country = 'IN';
        }
      } else if (digits.length === 12 && digits.startsWith('91')) {
        country = 'IN';
      } else if (digits.length === 11 && digits.startsWith('1')) {
        country = 'US';
      }
    }
    
    // Default to Indian if can't detect and number pattern matches
    if (!country) {
      if (digits.length === 10 && /^[6-9]/.test(digits)) {
        country = 'IN';
      } else {
        country = 'US'; // Default fallback
      }
    }
    
    const countryData = countryCodes[country];
    if (!countryData) return null;
    
    // Remove any existing country code or leading zero
    let localDigits = digits;
    if (localDigits.startsWith(countryData.code)) {
      localDigits = localDigits.substring(countryData.code.length);
    }
    while (localDigits.startsWith('0')) {
      localDigits = localDigits.substring(1);
    }
    
    // Format with country code
    return `+${countryData.code}${localDigits}`;
  }

  // Validate phone number thoroughly
  validatePhoneNumber(phone, channelCountry = null) {
    if (!phone) return { valid: false, reason: 'Empty' };
    
    const original = phone;
    const cleaned = this.cleanPhoneNumber(phone);
    
    if (!cleaned) {
      return { valid: false, reason: 'Invalid characters' };
    }
    
    const digits = this.extractDigits(cleaned);
    
    // Basic length check
    if (digits.length < 10 || digits.length > 15) {
      return { valid: false, reason: `Invalid length: ${digits.length} digits` };
    }
    
    // Check for fake numbers
    if (/^(\d)\1{9,}$/.test(digits)) {
      return { valid: false, reason: 'Fake number (all same digits)' };
    }
    
    // Check for sequential numbers
    const sequential = [
      '0123456789', '1234567890', '0987654321', '9876543210',
      '1111111111', '2222222222', '3333333333', '4444444444',
      '5555555555', '6666666666', '7777777777', '8888888888',
      '9999999999', '0000000000'
    ];
    
    for (const seq of sequential) {
      if (digits.includes(seq)) {
        return { valid: false, reason: 'Fake number (sequential)' };
      }
    }
    
    // Country-specific validation
    let detectedCountry = null;
    let isValid = false;
    
    // Try to detect country from number
    if (cleaned.startsWith('+')) {
      for (const [country, data] of Object.entries(countryCodes)) {
        if (digits.startsWith(data.code)) {
          detectedCountry = country;
          break;
        }
      }
    }
    
    // Use channel country if available and not detected
    if (!detectedCountry && channelCountry && countryCodes[channelCountry]) {
      detectedCountry = channelCountry;
    }
    
    // Validate based on detected country
    if (detectedCountry === 'IN') {
      isValid = this.validateIndianNumber(digits);
    } else if (detectedCountry === 'US' || detectedCountry === 'CA') {
      isValid = this.validateUSNumber(digits);
    } else if (detectedCountry === 'GB') {
      isValid = this.validateUKNumber(digits);
    } else if (detectedCountry) {
      isValid = this.validateInternationalNumber(digits, detectedCountry);
    } else {
      // Try to guess from pattern
      if (digits.length === 10) {
        if (/^[6-9]/.test(digits)) {
          isValid = this.validateIndianNumber(digits);
          if (isValid) detectedCountry = 'IN';
        } else if (/^[2-9]/.test(digits)) {
          isValid = this.validateUSNumber(digits);
          if (isValid) detectedCountry = 'US';
        }
      } else if (digits.length === 11 && digits.startsWith('0')) {
        const withoutZero = digits.substring(1);
        if (/^[6-9]/.test(withoutZero)) {
          isValid = this.validateIndianNumber(withoutZero);
          if (isValid) detectedCountry = 'IN';
        }
      }
    }
    
    if (!isValid) {
      return { valid: false, reason: 'Failed country-specific validation' };
    }
    
    // Format the number properly
    const formatted = this.formatPhoneNumber(cleaned, detectedCountry);
    
    return {
      valid: true,
      original,
      cleaned,
      formatted,
      detectedCountry,
      digits
    };
  }

  // Process a single channel
  async processChannel(channel) {
    if (!channel.phoneNumbers || channel.phoneNumbers.length === 0) {
      return { changed: false, validCount: 0 };
    }
    
    const originalPhones = [...channel.phoneNumbers];
    const validatedPhones = [];
    const changes = [];
    
    for (const phone of originalPhones) {
      this.stats.totalPhones++;
      
      const result = this.validatePhoneNumber(phone, channel.country);
      
      if (result.valid) {
        validatedPhones.push(result.formatted);
        this.stats.validPhones++;
        
        if (result.formatted !== phone) {
          changes.push({
            original: phone,
            corrected: result.formatted,
            country: result.detectedCountry
          });
          this.stats.correctedPhones++;
        }
        
        // Update country stats
        const country = result.detectedCountry || 'UNKNOWN';
        this.stats.countryStats[country] = (this.stats.countryStats[country] || 0) + 1;
        
      } else {
        this.stats.invalidPhones++;
        console.log(`   🗑️ Deleting invalid phone: ${phone} (${result.reason})`);
      }
    }
    
    // Remove duplicates
    const uniquePhones = [...new Set(validatedPhones)];
    
    const changed = JSON.stringify(originalPhones) !== JSON.stringify(uniquePhones);
    
    if (changed) {
      channel.phoneNumbers = uniquePhones;
      channel.contactInfo = {
        ...channel.contactInfo,
        hasPhone: uniquePhones.length > 0
      };
      channel.lastUpdated = new Date();
      await channel.save();
      
      if (changes.length > 0) {
        console.log(`   📞 Channel ${channel.title || channel.channelId}:`);
        changes.forEach(c => {
          console.log(`      ✏️ ${c.original} -> ${c.corrected} (${c.country})`);
        });
      }
    }
    
    return {
      changed,
      originalCount: originalPhones.length,
      newCount: uniquePhones.length,
      changes
    };
  }

  // Print statistics
  printStats() {
    console.log('\n=========================================');
    console.log('📊 PHONE NUMBER VALIDATION STATISTICS');
    console.log('=========================================\n');
    
    console.log(`📱 Total Phone Numbers Processed: ${this.stats.totalPhones}`);
    console.log(`✅ Valid Phone Numbers: ${this.stats.validPhones}`);
    console.log(`✏️  Corrected Phone Numbers: ${this.stats.correctedPhones}`);
    console.log(`❌ Invalid Phone Numbers Deleted: ${this.stats.invalidPhones}`);
    console.log(`📺 Channels Processed: ${this.stats.totalProcessed}`);
    
    if (this.stats.validPhones > 0) {
      const validPercentage = ((this.stats.validPhones / this.stats.totalPhones) * 100).toFixed(1);
      console.log(`📈 Validation Rate: ${validPercentage}%`);
    }
    
    console.log('\n🌍 Phone Numbers by Country:');
    console.log('-----------------------------------------');
    
    const sortedCountries = Object.entries(this.stats.countryStats)
      .sort((a, b) => b[1] - a[1]);
    
    for (const [country, count] of sortedCountries) {
      const percentage = ((count / this.stats.validPhones) * 100).toFixed(1);
      const countryName = countryCodes[country]?.name || country;
      console.log(`   ${countryName} (${country}): ${count} numbers (${percentage}%)`);
    }
  }
}

// ==================== MAIN FUNCTION ====================

async function fixPhoneNumbers() {
  console.log('=========================================');
  console.log('📞 PHONE NUMBER VALIDATION & CORRECTION');
  console.log('=========================================\n');

  const validator = new PhoneValidator();

  try {
    // Connect to MongoDB
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    // Get total channels
    const totalChannels = await Channel.countDocuments();
    const channelsWithPhones = await Channel.countDocuments({
      phoneNumbers: { $exists: true, $ne: [] }
    });
    
    console.log(`📺 Total Channels: ${totalChannels}`);
    console.log(`📞 Channels with Phone Numbers: ${channelsWithPhones}\n`);

    // Process channels with phone numbers
    const cursor = Channel.find({
      phoneNumbers: { $exists: true, $ne: [] }
    }).cursor();

    let processed = 0;
    let channelsChanged = 0;
    let totalOriginalPhones = 0;
    let totalNewPhones = 0;

    for await (const channel of cursor) {
      processed++;
      validator.stats.totalProcessed++;
      
      if (processed % 100 === 0) {
        console.log(`\n📊 Processed ${processed}/${channelsWithPhones} channels...`);
      }

      const result = await validator.processChannel(channel);
      
      if (result.changed) {
        channelsChanged++;
        totalOriginalPhones += result.originalCount;
        totalNewPhones += result.newCount;
      }
    }

    console.log('\n✅ Processing completed!');
    
    // Print statistics
    validator.printStats();
    
    console.log('\n📈 Summary of Changes:');
    console.log(`   - Channels modified: ${channelsChanged}`);
    console.log(`   - Original phone count: ${totalOriginalPhones}`);
    console.log(`   - New phone count: ${totalNewPhones}`);
    console.log(`   - Phones removed: ${totalOriginalPhones - totalNewPhones}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// ==================== PREVIEW FUNCTION ====================

async function previewPhoneNumbers() {
  console.log('🔍 PREVIEW MODE - No changes will be saved\n');

  const validator = new PhoneValidator();

  try {
    await mongoose.connect(mongoURI);
    
    const channelsWithPhones = await Channel.countDocuments({
      phoneNumbers: { $exists: true, $ne: [] }
    });
    
    console.log(`📞 Channels with Phone Numbers: ${channelsWithPhones}\n`);

    // Sample 20 channels for preview
    const sample = await Channel.aggregate([
      { $match: { phoneNumbers: { $exists: true, $ne: [] } } },
      { $sample: { size: 20 } }
    ]);

    let totalIssues = 0;

    for (const channel of sample) {
      console.log(`\n📺 Channel: ${channel.title || channel.channelId}`);
      console.log(`   Country: ${channel.country || 'Unknown'}`);
      console.log(`   Current phones: ${channel.phoneNumbers.length}`);
      
      for (const phone of channel.phoneNumbers) {
        const result = validator.validatePhoneNumber(phone, channel.country);
        
        if (result.valid) {
          if (result.formatted !== phone) {
            console.log(`   ⚠️ Would fix: ${phone} -> ${result.formatted} (${result.detectedCountry})`);
            totalIssues++;
          } else {
            console.log(`   ✅ Valid: ${phone} (${result.detectedCountry})`);
          }
        } else {
          console.log(`   ❌ Would delete: ${phone} (${result.reason})`);
          totalIssues++;
        }
      }
    }

    console.log(`\n📊 Preview Summary:`);
    console.log(`   - Issues found that need fixing: ${totalIssues}`);
    console.log(`   - Run option 1 to apply fixes`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// ==================== RUN THE SCRIPT ====================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=========================================');
console.log('📞 PHONE NUMBER FIX TOOL');
console.log('=========================================\n');
console.log('Options:');
console.log('1. Fix phone numbers (validate and correct)');
console.log('2. Preview only (see what will be fixed)');
console.log('3. Exit\n');

rl.question('Choose option (1/2/3): ', async (answer) => {
  if (answer === '1') {
    console.log('\n⚠️  WARNING: This will modify your database!');
    console.log('It will:');
    console.log('   - Validate all phone numbers');
    console.log('   - Add correct country codes');
    console.log('   - Remove invalid/fake numbers');
    console.log('   - Format numbers consistently\n');
    
    rl.question('Are you sure? (yes/no): ', async (confirm) => {
      if (confirm.toLowerCase() === 'yes') {
        await fixPhoneNumbers();
      } else {
        console.log('❌ Operation cancelled');
      }
      rl.close();
    });
  } else if (answer === '2') {
    await previewPhoneNumbers();
    rl.close();
  } else {
    console.log('👋 Goodbye!');
    rl.close();
  }
});