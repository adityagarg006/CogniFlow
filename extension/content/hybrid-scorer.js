
(function () {
  "use strict";

  // FK GRADE LEVEL
  function _fkNormalized(text) {
    const result = CogniFlowFK.computeFK(text);
    // Normalize to 0-1 range: grade 5 = 0, grade 20+ = 1
    return {
      score: Math.max(0, Math.min(1, (result.gradeLevel - 5) / 15)),
      gradeLevel: result.gradeLevel,
      words: result.words,
      sentences: result.sentences
    };
  }

  // DALE CHAL DATASET FOR COMMON WORDS
  const COMMON_WORDS = new Set([
    "the","be","to","of","and","a","in","that","have","i","it","for","not","on",
    "with","he","as","you","do","at","this","but","his","by","from","they","we",
    "say","her","she","or","an","will","my","one","all","would","there","their",
    "what","so","up","out","if","about","who","get","which","go","me","when",
    "make","can","like","time","no","just","him","know","take","people","into",
    "year","your","good","some","could","them","see","other","than","then","now",
    "look","only","come","its","over","think","also","back","after","use","two",
    "how","our","work","first","well","way","even","new","want","because","any",
    "these","give","day","most","us","great","between","need","large","often",
    "hand","high","place","hold","small","help","every","home","never","last",
    "long","much","before","right","too","mean","old","life","tell","still",
    "should","call","world","may","find","here","thing","many","change","part",
    "begin","seem","move","show","try","keep","start","run","play","turn","point",
    "leave","form","off","set","put","end","why","while","ask","read","write",
    "might","same","does","went","next","man","own","follow","must","very","through",
    "name","line","house","story","down","did","where","live","group","grow",
    "stop","close","open","carry","let","thought","head","near","eye","number",
    "side","school","under","last","city","until","few","more","state","another",
    "once","food","water","body","young","family","land","car","father","mother",
    "children","important","girl","enough","being","boy","face","both","along",
    "door","kind","second","early","room","money","learn","fact","since","against",
    "area","during","sure","those","hard","better","little","listen","order","idea",
    "real","book","became","power","bring","word","country","talk","love","old",
    "night","three","four","five","six","seven","eight","nine","ten","question",
    "study","general","able","always","problem","system","program","best","different",
    "business","company","level","market","service","public","government","case",
    "report","done","nothing","million","plan","age","already","either","before",
    "yes","actually","whole","though","class","feel","less","possible","quite",
    "strong","seen","rather","information","data","each","type","based","example",
    "support","process","result","simple","clear","child","human","social","free",
    "full","above","low","ready","price","short","include","role","matter","often",
    "town","town","south","north","east","west","white","black","left","right",
    "red","green","blue","color","nature","month","week","hour","minute","second",
    "water","air","fire","earth","light","dark","big","small","large","little",
    "fast","slow","hot","cold","warm","cool","hard","soft","heavy","light",
    "deep","wide","tall","long","clean","clear","true","false","open","close",
    "rich","poor","safe","strong","weak","easy","simple","single","common","basic",
    "ready","available","local","total","final","main","major","current","recent",
    "likely","similar","serious","natural","physical","human","personal","direct",
    "various","special","central","possible","particular","certain","specific",
    "provide","offer","allow","continue","create","expect","happen","appear",
    "involve","remain","suggest","consider","serve","cause","achieve","produce",
    "raise","build","develop","determine","receive","manage","describe","agree",
    "accept","apply","add","establish","prepare","design","cover","remove","return",
    "complete","require","lead","contain","present","claim","express","deliver",
    "reduce","meet","record","note","enjoy","choose","face","share","reach",
    "represent","explain","pick","avoid","enter","fill","replace","measure",
    "drive","affect","address","visit","spend","approach","perform","connect",
    "announce","form","view","test","deal","head","experience","issue","result",
    "position","stand","increase","demand","action","activity","evidence","effort",
    "practice","account","decision","market","condition","growth","attention",
    "control","population","period","range","image","value","force","statement",
    "effect","pressure","response","success","voice","concern","interest","rate",
    "network","article","patient","health","model","risk","source","individual",
    "century","event","series","subject","section","standard","technology","base"
  ]);


  //COMPUTING JARGON DENSITY
  function _jargonDensity(text) {
    const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
    if (words.length === 0) return { score: 0, sophisticatedWords: [], ratio: 0 };

    let totalWeight = 0;
    const sophisticatedWords = [];

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length <= 3) continue; 

      if (!COMMON_WORDS.has(w)) {
        const syllables = CogniFlowFK.countSyllables(w);
        const weight = syllables >= 4 ? 3 : syllables >= 3 ? 2 : 1;
        totalWeight += weight;
        if (syllables >= 3) {
          sophisticatedWords.push(w);
        }
      }
    }

    const density = words.length > 0 ? totalWeight / words.length : 0;
    const normalized = Math.min(1, density / 0.6); // 0.6 density = maximum complexity

    return {
      score: Math.round(normalized * 100) / 100,
      sophisticatedWords: [...new Set(sophisticatedWords)].slice(0, 10),
      ratio: Math.round(density * 1000) / 1000,
      totalWords: words.length
    };
  }

  // COMPUTING STRUCTURAL COMPLEXITY
  function _structuralComplexity(text) {
    const sentences = CogniFlowFK.splitSentences(text);
    if (sentences.length === 0) return { score: 0, passiveCount: 0, avgClauseDepth: 0, ambiguousPronouns: 0 };

    let passiveCount = 0;
    let totalClauseDepth = 0;
    let ambiguousPronouns = 0;

    const passiveRegex = /\b(is|are|was|were|been|being|gets?|got)\s+(\w+ed|(\w+en))\b/gi;

    const ambiguousPronounRegex = /^(it|this|that|these|those|which)\s/i;
    const midSentencePronounRegex = /,\s*(which|that|this)\s/gi;

    for (const sentence of sentences) {
      const passiveMatches = sentence.match(passiveRegex);
      if (passiveMatches) passiveCount += passiveMatches.length;

      const commas = (sentence.match(/,/g) || []).length;
      const semicolons = (sentence.match(/;/g) || []).length;
      const subordinators = (sentence.match(/\b(which|although|whereas|nevertheless|furthermore|moreover|however|consequently|notwithstanding)\b/gi) || []).length;
      totalClauseDepth += commas + semicolons * 2 + subordinators * 2;

      if (ambiguousPronounRegex.test(sentence.trim())) ambiguousPronouns++;
      const midMatches = sentence.match(midSentencePronounRegex);
      if (midMatches) ambiguousPronouns += midMatches.length;
    }

    const avgClauseDepth = totalClauseDepth / sentences.length;
    const passiveRatio = passiveCount / sentences.length;
    const ambiguousRatio = ambiguousPronouns / sentences.length;

    const clauseScore = Math.min(1, avgClauseDepth / 5);
    const passiveScore = Math.min(1, passiveRatio / 0.5);
    const ambiguityScore = Math.min(1, ambiguousRatio / 0.4);

    const composite = clauseScore * 0.45 + passiveScore * 0.30 + ambiguityScore * 0.25;

    return {
      score: Math.round(composite * 100) / 100,
      passiveCount,
      avgClauseDepth: Math.round(avgClauseDepth * 10) / 10,
      ambiguousPronouns,
      sentenceCount: sentences.length
    };
  }


  const WEIGHTS = { fk: 0.40, jargon: 0.35, structural: 0.25 };

  const THRESHOLDS = {
    adhd: 0.35,
    autism: 0.45,
    dyslexia: 0.25,
    default: 0.40
  };

  //FINAL SCORE CALCULATION
  function scoreComplexity(text) {
    if (!text || text.trim().length < 30) {
      return { composite: 0, fk: { score: 0 }, jargon: { score: 0 }, structural: { score: 0 } };
    }

    const fk = _fkNormalized(text);
    const jargon = _jargonDensity(text);
    const structural = _structuralComplexity(text);

    const composite = Math.round((
      WEIGHTS.fk * fk.score +
      WEIGHTS.jargon * jargon.score +
      WEIGHTS.structural * structural.score
    ) * 100) / 100;

    return {
      composite,         
      fk,
      jargon,
      structural,
      gradeLevel: fk.gradeLevel,
      difficulty: composite > 0.6 ? "very hard" : composite > 0.4 ? "hard" : composite > 0.25 ? "moderate" : "easy"
    };
  }

  function isComplexForProfile(text, profile) {
    const threshold = THRESHOLDS[profile] || THRESHOLDS.default;
    const result = scoreComplexity(text);
    return result.composite > threshold;
  }

  // FETCH COMPLEX SEGMENTS FOR REWORDING
  function getComplexSegments(text, profile) {
    const threshold = THRESHOLDS[profile] || THRESHOLDS.default;
    const sentences = CogniFlowFK.splitSentences(text);
    const segments = [];

    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      if (s.split(/\s+/).length < 5) continue; // Skip very short sentences

      const score = scoreComplexity(s);
      segments.push({
        index: i,
        text: s,
        composite: score.composite,
        gradeLevel: score.gradeLevel,
        difficulty: score.difficulty,
        needsSimplification: score.composite > threshold,
        jargonWords: score.jargon.sophisticatedWords
      });
    }

    const complexCount = segments.filter(s => s.needsSimplification).length;

    return {
      segments,
      allSentences: sentences,
      totalSentences: sentences.length,
      complexCount,
      complexRatio: sentences.length > 0 ? complexCount / sentences.length : 0,
      overallScore: scoreComplexity(text)
    };
  }


  window.CogniFlowScorer_v2 = {
    scoreComplexity,
    isComplexForProfile,
    getComplexSegments,
    THRESHOLDS,
    WEIGHTS,
    _fkNormalized,
    _jargonDensity,
    _structuralComplexity
  };

})();