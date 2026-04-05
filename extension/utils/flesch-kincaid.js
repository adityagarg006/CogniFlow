(function () {
  "use strict";

  // SYLLABLE COUNTER
  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, "");
    if (word.length <= 2) return 1;

    const exceptions = {
      "every": 3, "area": 3, "idea": 3, "real": 2, "create": 2,
      "business": 3, "different": 3, "evening": 3, "general": 3,
      "interest": 3, "beautiful": 3, "family": 3, "comfortable": 4,
      "chocolate": 3, "camera": 3, "average": 3, "actually": 4,
      "experience": 4, "favorite": 3, "vegetable": 4
    };
    if (exceptions[word]) return exceptions[word];

    let w = word.replace(/e$/, "");

    const vowelGroups = w.match(/[aeiouy]+/g);
    let count = vowelGroups ? vowelGroups.length : 1;

    if (word.endsWith("le") && word.length > 2 && !/[aeiouy]/.test(word[word.length - 3])) {
      count++; 
    }
    if (word.endsWith("es") || word.endsWith("ed")) {
      if (word.endsWith("ed") && !/[td]/.test(word[word.length - 3])) {
        count--;
      }
    }
    if (word.endsWith("tion") || word.endsWith("sion")) count = Math.max(count, 2);
    if (word.endsWith("ious") || word.endsWith("eous")) count++;

    return Math.max(1, count);
  }

  // SENTENCE SPLITTER
  function splitSentences(text) {
    const abbrevs = /(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|Inc|Ltd|Corp|vs|etc|e\.g|i\.e)\./gi;
    const cleaned = text.replace(abbrevs, (match) => match.replace(".", "⟨DOT⟩"));
    const sentences = cleaned
      .split(/[.!?]+\s+|[.!?]+$/)
      .map(s => s.replace(/⟨DOT⟩/g, ".").trim())
      .filter(s => s.length > 3);
    return sentences.length > 0 ? sentences : [text];
  }

  // FK SCORE COMPUTATION
  function computeFK(text) {
    if (!text || text.trim().length < 20) {
      return { gradeLevel: 0, readingEase: 100, words: 0, sentences: 0, syllables: 0 };
    }

    const sentences = splitSentences(text);
    const words = text.match(/\b[a-zA-Z']+\b/g) || [];
    
    if (words.length === 0 || sentences.length === 0) {
      return { gradeLevel: 0, readingEase: 100, words: 0, sentences: 0, syllables: 0 };
    }

    let totalSyllables = 0;
    for (let i = 0; i < words.length; i++) {
      totalSyllables += countSyllables(words[i]);
    }

    const wordsPerSentence = words.length / sentences.length;
    const syllablesPerWord = totalSyllables / words.length;

    const gradeLevel = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
    const readingEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;

    return {
      gradeLevel: Math.max(0, Math.round(gradeLevel * 10) / 10),
      readingEase: Math.max(0, Math.min(100, Math.round(readingEase * 10) / 10)),
      words: words.length,
      sentences: sentences.length,
      syllables: totalSyllables
    };
  }

  // PROFILE COMPLEXITY CHECK
  function isComplexForProfile(text, profile) {
    const threshold = COGNIFLOW_CONFIG.FK_THRESHOLD[profile] || COGNIFLOW_CONFIG.FK_THRESHOLD.default;
    const result = computeFK(text);
    console.log(result.gradeLevel);
    return result.gradeLevel > threshold;
  }

  // COMPLEX SENTENCES EXTRACTOR
  function getComplexSentences(text, profile) {
    const threshold = COGNIFLOW_CONFIG.FK_THRESHOLD[profile] || COGNIFLOW_CONFIG.FK_THRESHOLD.default;
    const sentences = splitSentences(text);
    const complex = [];

    for (let i = 0; i < sentences.length; i++) {
      const fk = computeFK(sentences[i]);
      if (fk.gradeLevel > threshold && fk.words >= 6) {
        complex.push({
          index: i,
          text: sentences[i],
          gradeLevel: fk.gradeLevel,
          wordCount: fk.words
        });
      }
    }

    return {
      complexSentences: complex,
      totalSentences: sentences.length,
      allSentences: sentences,
      complexRatio: sentences.length > 0 ? complex.length / sentences.length : 0
    };
  }

  // PARAGRAPH SUMMARY
  function analyzeParagraph(text) {
    const fk = computeFK(text);
    const sentenceData = getComplexSentences(text, "default");
    return {
      ...fk,
      complexSentenceCount: sentenceData.complexSentences.length,
      totalSentenceCount: sentenceData.totalSentences,
      complexRatio: sentenceData.complexRatio,
      isWallOfText: fk.words > COGNIFLOW_CONFIG.TIER2.MAX_PARAGRAPH_WORDS_ADHD,
      estimatedReadTimeSeconds: Math.ceil(fk.words / 4.2) // avg reading speed ~250wpm = ~4.2wps
    };
  }
  window.CogniFlowFK = {
    countSyllables,
    computeFK,
    isComplexForProfile,
    getComplexSentences,
    analyzeParagraph,
    splitSentences
  };
})();
