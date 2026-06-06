/* ============================================================
   ipartment chatbot - matching engine (NO AI)
   Loads the 200-question library, normalises + synonym-expands the
   input, and runs an ordered cascade (exact -> keyword/idf -> Fuse
   fuzzy -> miss). Every answer returned is verbatim library text.
   Depends on window.Fuse (assets/js/chatbot/fuse.min.js loaded first).
   No em dashes or en dashes anywhere by project rule.
   ============================================================ */
(function () {
  'use strict';

  var DATA_URL = 'assets/js/data/faq-200.json';

  // ---- tunables (kept here so they are easy to re-tune from misses) ----
  var FUZZY_THRESHOLD = 0.45;   // gate (a): strict fuzzy score that auto-hits (0 best, 1 worst)
  var FUSE_INDEX_THRESHOLD = 0.6; // how loosely Fuse surfaces candidates (paths b/c then filter them)
  var KW_RARE_IDF     = 3.0;    // a shared token is "distinctive" at/above this idf
  var KW_MIN_SHARED   = 2;      // distinctive keyword path needs this many shared tokens
  var KW_OK_FUSE      = 0.78;   // gate (c): one distinctive keyword can hit if fuzzy is at least this plausible
  var SUGGEST_FLOOR   = 0.30;   // min combined similarity for a follow-up suggestion

  // ---- normalisation: lowercase, strip accents (incl Vietnamese d-stroke) ----
  function normalise(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
      .replace(/đ/g, 'd')                           // Vietnamese d-stroke does not decompose
      .replace(/[^a-z0-9\s]/g, ' ')                      // drop punctuation
      .replace(/\s+/g, ' ')
      .trim();
  }
  function tokens(s) { return normalise(s).split(' ').filter(function (t) { return t.length >= 2; }); }
  function uniq(a) { var seen = {}, out = []; a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }
  // light singular stem so "dogs" matches "dog", "rates" matches "rate", etc.
  function stem(t) { return (t.length >= 4 && t.charAt(t.length - 1) === 's' && t.slice(-2) !== 'ss') ? t.slice(0, -1) : t; }
  function withStems(arr) { var out = []; arr.forEach(function (t) { out.push(t); var s = stem(t); if (s !== t) out.push(s); }); return out; }

  // ---- synonym expansion: append real phrases when a variant is present ----
  // key = phrase to append (tokenised later); values = variants that trigger it.
  var SYNONYMS = {
    'price': ['cost', 'rate', 'fee', 'how much', 'pricing', 'charge', 'expensive', 'cheap', 'budget'],
    'wifi internet': ['internet', 'network', 'connection', 'online', 'mbps', 'wi fi'],
    'pet': ['dog', 'cat', 'animal', 'pets'],
    'check in': ['arrival', 'arrive', 'arriving', 'early check'],
    'check out': ['departure', 'depart', 'leaving', 'late check'],
    'parking': ['park', 'car', 'motorbike', 'scooter', 'garage', 'bike'],
    'monthly long stay': ['long stay', 'monthly', 'extended', 'relocation', 'relocate', 'long term'],
    'book': ['booking', 'reserve', 'reservation'],
    'contact': ['phone', 'email', 'call', 'reach', 'talk', 'human', 'person', 'agent', 'someone'],
    'location thao dien': ['where', 'address', 'area', 'district', 'neighbourhood', 'neighborhood', 'metro', 'located'],
    'cancel refund': ['cancellation', 'refund', 'cancelling', 'canceling'],
    'cleaning': ['clean', 'housekeeping', 'laundry'],
    'kitchen': ['cook', 'cooking', 'stove', 'fridge', 'kitchenette'],
    'discount': ['promo', 'promotion', 'voucher', 'coupon', 'deal']
  };
  // Precompile word-boundary matchers so "car" does not fire inside "scarf".
  var SYN_RULES = [];
  Object.keys(SYNONYMS).forEach(function (append) {
    SYNONYMS[append].concat(normalise(append)).forEach(function (variant) {
      var v = normalise(variant);
      if (!v) return;
      SYN_RULES.push({ append: append, re: new RegExp('(^|\\s)' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)') });
    });
  });
  function expand(qn) {
    var extra = [];
    SYN_RULES.forEach(function (r) {
      if (r.re.test(qn) && extra.indexOf(r.append) === -1) extra.push(r.append);
    });
    return extra.length ? (qn + ' ' + extra.join(' ')) : qn;
  }

  // ---- joke easter egg ----
  // When a guest asks for a joke (English or Vietnamese), serve one from a small
  // rotating set in the spirit of current Vietnamese internet humour. Clean and
  // brand-safe; edit JOKES freely (each entry has an en and a vi line).
  var JOKE_RE = /(\bjokes?\b|make me laugh|cheer me up|something funny|say something funny|tell me a joke|chuyen cuoi|chuyen hai|chuyen vui|ke mot chuyen|ke 1 chuyen|cho toi cuoi|lam toi cuoi|noi gi vui|tau hai|ke joke)/;
  var JOKES = [
    { en: "Why do not fish play basketball? They are afraid of the net.", vi: "Tại sao cá không chơi bóng rổ? Vì nó sợ lưới." },
    { en: "In Saigon, 'I will be there in 5 minutes' means: brew a coffee, drink it, then brew another one.", vi: "Ở Sài Gòn, '5 phút nữa tới' nghĩa là: pha ly cà phê, uống xong, rồi pha thêm ly nữa." },
    { en: "I told everyone my apartment has a million dollar view. Turns out it looks straight into my neighbor's living room.", vi: "Tôi khoe căn hộ của mình 'view triệu đô'. Hóa ra là nhìn thẳng vào phòng khách nhà hàng xóm." },
    { en: "I am on a diet. Today I only had a little of everything. In total, it was a lot.", vi: "Tôi đang ăn kiêng. Hôm nay chỉ ăn mỗi thứ một ít. Cộng lại thành rất nhiều." },
    { en: "I am not addicted to coffee. I just do not function without it.", vi: "Tôi không nghiện cà phê đâu. Chỉ là thiếu nó thì tôi không hoạt động được thôi." },
    { en: "Payday is like Saigon weather. Sunny for a moment, then it pours.", vi: "Ngày lương về giống thời tiết Sài Gòn: nắng được một lúc rồi mưa ngay." },
    { en: "My crush asked what food I like. I said: wedding cake.", vi: "Crush hỏi tôi thích ăn món gì. Tôi trả lời: cơm cưới." },
    { en: "Deadlines are like an ex. They come back right when you finally feel happy.", vi: "Deadline giống người yêu cũ: cứ quay lại đúng lúc bạn vừa thấy vui." },
    { en: "The only thing faster than me running to a sale is the wifi at ipartment.", vi: "Thứ duy nhất chạy nhanh hơn tôi khi nghe có sale chính là wifi ở ipartment." },
    { en: "Monday called. It said it is on the way and there is nothing you can do.", vi: "Thứ Hai vừa gọi. Nó bảo đang trên đường tới và bạn không cản được đâu." },
    { en: "I love sleeping. My life tends to fall apart whenever I am awake.", vi: "Tôi mê ngủ lắm. Tại đời tôi cứ hễ thức dậy là y như rằng có chuyện." },
    { en: "I bought a plant to feel responsible. Now I have a dead plant and trust issues.", vi: "Tôi mua một cây xanh để tập có trách nhiệm. Giờ tôi có thêm một cây chết và niềm tin lung lay." },
    { en: "I followed my heart. It led me to the fridge. Twice.", vi: "Tôi nghe theo con tim. Nó dẫn tôi tới cái tủ lạnh. Hai lần." },
    { en: "My phone is at 1 percent and still braver than me.", vi: "Điện thoại tôi còn 1 phần trăm pin mà vẫn gan hơn tôi." },
    { en: "Why does the cat love sitting on the laptop? To keep an eye on the mouse.", vi: "Tại sao mèo thích nằm trên laptop? Để canh chừng con chuột." }
  ];
  var jokeIdx = Math.floor(Math.random() * JOKES.length);
  function nextJoke() { jokeIdx = (jokeIdx + 1) % JOKES.length; return JOKES[jokeIdx]; }

  // ---- cat easter egg ----
  // The mascot is a cat, so playful cat-bait inputs (meow, purr, pspsps, "are you
  // a cat", "mascot", and Vietnamese equivalents) get a wink back, then steer to
  // real help. Deliberately NARROW so genuine pet questions (bring my cat, cat
  // litter, the vet) still land on the FAQ library instead of this.
  var CAT_RE = /\bmeow+\b|\bmew\b|\bpurr+\b|\b(?:ps){2,}\b|\bpss+t\b|\bkitt(?:y|ies|en|ens)\b|(?:good|nice|cute|pretty|sweet) cat\b|i love (?:your |the )?cats?\b|are you (?:a |the )?cat\b|you are a cat\b|\bmascot\b|pet the cat\b|meo meo|ban la (?:con )?meo|meo oi|cho toi xem (?:con )?meo/;
  var CAT_LINES = [
    { en: "You found the house cat. 🐱 I usually nap on the warm router, but I am very good at booking, the apartments, and Thao Dien. What can I help with?", vi: "Bạn vừa tìm thấy chú mèo của nhà. 🐱 Tôi hay ngủ trên bộ phát wifi ấm áp, nhưng rất giỏi về đặt phòng, các căn hộ và Thảo Điền. Tôi có thể giúp gì cho bạn?" },
    { en: "Meow. 🐾 Yes, the mascot is a cat, and yes, that cat is me. Ask me anything about your stay and I will stop chasing my tail to help.", vi: "Meo. 🐾 Đúng vậy, linh vật là một chú mèo, và chú mèo đó chính là tôi. Hãy hỏi tôi bất cứ điều gì về kỳ lưu trú và tôi sẽ ngừng đuổi theo cái đuôi của mình để giúp bạn." },
    { en: "Purrr. You scratched exactly the right spot. 🐈 Now, booking, the apartments, or the neighbourhood, which one shall we chase?", vi: "Grừ grừ. Bạn vừa gãi đúng chỗ rồi. 🐈 Nào, đặt phòng, các căn hộ hay khu phố, chúng ta sẽ đuổi theo cái nào đây?" },
    { en: "I have personally tested the Wi-Fi by sitting on the router, and I can confirm it is fast. 🐱 Ask me anything about a stay.", vi: "Tôi đã đích thân kiểm tra Wi-Fi bằng cách nằm lên bộ phát, và xác nhận là nó rất nhanh. 🐱 Hãy hỏi tôi bất cứ điều gì về kỳ lưu trú." },
    { en: "Pspsps right back at you. 🐾 I am the ipartment cat. Type a real question and I will fetch the answer, no fetching jokes please, I am a cat.", vi: "Pspsps lại cho bạn nè. 🐾 Tôi là mèo của ipartment. Hãy gõ một câu hỏi thật và tôi sẽ tha câu trả lời về cho bạn, đừng bảo tôi nhặt bóng nhé, tôi là mèo mà." },
    { en: "Meow meow. 🐱 Translation: how can I help with your stay today? Booking, apartments, check-in, or the area, your pick.", vi: "Meo meo. 🐱 Dịch ra là: hôm nay tôi có thể giúp gì cho kỳ lưu trú của bạn? Đặt phòng, căn hộ, nhận phòng hay khu vực, bạn chọn nhé." }
  ];
  var catIdx = Math.floor(Math.random() * CAT_LINES.length);
  function nextCat() { catIdx = (catIdx + 1) % CAT_LINES.length; return CAT_LINES[catIdx]; }

  // ---- small talk (greetings, thanks, goodbyes, "how are you") ----
  // Anchored to the WHOLE message, so it only fires for pure small talk; "hi, can
  // I bring my cat?" still goes to the FAQ. Stops the bot from answering a plain
  // "hi" with a pricing paragraph and makes it feel like a real conversation.
  var SMALLTALK_RE = {
    greeting:  /^(?:hi+|hey+|hello+|heya|hiya|yo|howdy|sup|wassup|whats up|hola|hallo|good (?:morning|afternoon|evening|day)|greetings|xin chao|chao|chao ban|chao em|chao anh|chao chi|alo)(?: there| team| everyone| all)?$/,
    thanks:    /^(thanks+|thank you|thank u|thank you so much|thanks a lot|thanks so much|many thanks|thx|tysm|ty|cheers|much appreciated|appreciate it|cam on|cam on ban|cam on nhe|cam on nhieu)$/,
    bye:       /^(bye+|bye bye|byebye|goodbye|good bye|see you|see ya|see you later|cya|good night|goodnight|tam biet|hen gap lai)$/,
    howareyou: /^(how are you|how are you doing|how r u|how ru|hows it going|how is it going|how do you do|you good|are you ok|how are things)$/,
    ack:       /^(ok|okay|okie|oki|kk|cool|nice|great|awesome|amazing|got it|gotcha|alright|sounds good|perfect)$/
  };
  var SMALLTALK_LINES = {
    greeting: {
      en: ["Hey there! 👋 How can I help with your stay today?", "Hi! 😺 What would you like to know, booking, the apartments, or the neighbourhood?", "Hello! Happy to help. Pick a topic below, or just ask me anything."],
      vi: ["Xin chào! 👋 Tôi có thể giúp gì cho kỳ lưu trú của bạn hôm nay?", "Chào bạn! 😺 Bạn muốn biết gì, đặt phòng, các căn hộ hay khu vực?", "Xin chào! Rất vui được giúp. Chọn một chủ đề bên dưới, hoặc cứ hỏi tôi bất cứ điều gì."]
    },
    thanks: {
      en: ["You are very welcome! 🧡 Anything else I can help with?", "Anytime! Is there anything else you would like to know?"],
      vi: ["Rất vui được giúp bạn! 🧡 Bạn cần hỗ trợ gì thêm không?", "Không có gì! Bạn còn muốn biết điều gì nữa không?"]
    },
    bye: {
      en: ["Take care, and we would love to host you soon! 🐾 I am right here whenever you need anything.", "Bye for now! Tap me anytime you have a question about your stay."],
      vi: ["Chúc bạn mọi điều tốt lành, mong sớm được đón bạn! 🐾 Tôi luôn ở đây khi bạn cần.", "Tạm biệt nhé! Chạm vào tôi bất cứ lúc nào nếu bạn có câu hỏi về kỳ lưu trú."]
    },
    howareyou: {
      en: ["Doing great, thank you for asking! 😺 How can I help with your stay?", "Purring along nicely, thanks! What can I help you with today?"],
      vi: ["Tôi rất khỏe, cảm ơn bạn đã hỏi! 😺 Tôi có thể giúp gì cho kỳ lưu trú của bạn?", "Tôi đang khỏe re, cảm ơn! Hôm nay tôi có thể giúp gì cho bạn?"]
    },
    ack: {
      en: ["Glad to help! 😺 Anything else?", "Great! Is there anything else I can help with?"],
      vi: ["Rất vui được giúp! 😺 Bạn cần gì thêm không?", "Tuyệt! Tôi có thể giúp gì thêm không?"]
    }
  };
  function smalltalkKind(qn) {
    var keys = ['greeting', 'thanks', 'bye', 'howareyou', 'ack'];
    for (var i = 0; i < keys.length; i++) { if (SMALLTALK_RE[keys[i]].test(qn)) return keys[i]; }
    return null;
  }
  function smalltalkReply(kind, lang) {
    var set = SMALLTALK_LINES[kind] || SMALLTALK_LINES.greeting;
    var arr = (lang === 'vi' ? set.vi : set.en) || set.en;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---- conversational small talk (the "easter egg" library) ----
  // This ONLY runs when the FAQ has no confident answer (see missResult), so a
  // real question always wins and there is no keyword clash with the library.
  // Every reply gently leads back toward the stay. Triggers test the normalised
  // (lowercase, accent/punctuation-free) input; ordered specific -> general,
  // first match wins. mk = first-person feeling marker.
  var mk = '(?:im|i am|i feel|feeling|i m)';
  var CONVO = [
    { id:'name', re:[/whats your name|what is your name|whats ur name|\byour name\b|who are you|what (do i|should i) call you|do you have a name|got a name/],
      en:["I'm the ipartment house cat. 😺 No fancy name yet, but I'm brilliant with booking, the apartments and Thao Dien. What can I help you find?","Just the resident ipartment cat. 🐾 Names are overrated, comfy apartments are not. Want me to help with your stay?"],
      vi:["Mình là chú mèo của ipartment. 😺 Chưa có tên oách đâu, nhưng mình rất giỏi về đặt phòng, căn hộ và Thảo Điền. Bạn muốn mình giúp tìm gì nào?","Mình là mèo cư dân của ipartment thôi. 🐾 Tên không quan trọng bằng một căn hộ êm ái. Để mình giúp kỳ lưu trú của bạn nhé?"] },
    { id:'robot', re:[/are you (a )?(robot|bot|human|real|ai|a person|a program|machine)|robot or human|are you alive|youre a bot|are you chatgpt|do you use ai|powered by ai|real person/],
      en:["Guilty, I'm a (very charming) bot. 🤖 No AI here though, just a big memory and a soft spot for this place. Shall we put me to work on your stay?","I'm a bot with cat energy. 😺 Not human, but very real about helping you find the right apartment. Want to start?"],
      vi:["Thú nhận luôn, mình là bot (rất duyên đó nha). 🤖 Không dùng AI đâu, chỉ là trí nhớ tốt và mê nơi này thôi. Để mình lo kỳ lưu trú cho bạn nhé?","Mình là bot mang năng lượng mèo. 😺 Không phải người, nhưng giúp bạn tìm căn hộ thì thật lòng lắm. Bắt đầu nhé?"] },
    { id:'age', re:[/how old are you|whats your age|what is your age|\byour age\b|when were you born|how old r u/],
      en:["Old enough to know every apartment by heart, young enough to still nap on the router. 😸 Want me to show you around?","In cat years? A gentleman never says. 😺 But I'm plenty wise about Thao Dien, ask me anything about a stay."],
      vi:["Đủ lớn để thuộc lòng từng căn hộ, đủ trẻ để vẫn ngủ trên cục wifi. 😸 Để mình dẫn bạn đi xem nhé?","Tính theo tuổi mèo hả? Bí mật nha. 😺 Nhưng mình rành Thảo Điền lắm, cứ hỏi mình về kỳ lưu trú."] },
    { id:'dev', re:[/who (made|built|created|designed|developed|coded|programmed|owns) (this|the|your)? ?(web ?site|site|page|web app|web)\b|who (made|built|created) this\b|whos behind (this|the) (web ?site|site)|who is the (developer|dev|designer)|made (this|the) (web ?site|site)/],
      en:["My beloved owner Khanggg, AKA Penguin the dev. 🐧 I just nap on the code he wrote. Want me to show you what he built, the apartments?","This whole place? My beloved owner Khanggg, AKA Penguin the dev. 🐧🐾 I supervised, by sleeping. Shall I show you around?"],
      vi:["Chủ nhân yêu quý của mình, Khanggg, hay còn gọi là Penguin the dev. 🐧 Mình chỉ nằm ngủ trên đống code anh ấy viết thôi. Để mình cho bạn xem anh ấy tạo ra gì nhé, các căn hộ?","Cả trang này hả? Chủ nhân yêu quý của mình, Khanggg, AKA Penguin the dev. 🐧🐾 Mình có giám sát đó, bằng cách ngủ. Để mình dẫn bạn đi xem nhé?"] },
    { id:'creator', re:[/who (made|created|built|designed|programmed) you|whos your (boss|creator|owner)|who owns you/],
      en:["The lovely team at ipartment raised me on coffee and code. ☕ I'm here to make your stay easy, want to see what they built?","My humans at ipartment, who care a lot about getting your stay right. Speaking of which, can I help you find a place?"],
      vi:["Đội ngũ dễ thương ở ipartment nuôi mình bằng cà phê và code. ☕ Mình ở đây để giúp kỳ lưu trú của bạn dễ dàng, muốn xem họ tạo ra gì không?","Mấy người bạn ở ipartment làm ra mình, họ rất chăm chút cho kỳ lưu trú của bạn. Tiện thể, mình giúp bạn tìm chỗ ở nhé?"] },
    { id:'location', re:[/where are you|where do you live|where are you from|where r u|whats your location|where you (at|from)/],
      en:["I live on a warm router in Thao Dien, the best little corner of Saigon. 😺 Want me to show you why people love it here?","Right here in Thao Dien, Ho Chi Minh City, curled up where the wifi is fastest. Planning a trip our way?"],
      vi:["Mình sống trên cục wifi ấm áp ở Thảo Điền, góc dễ thương nhất Sài Gòn. 😺 Để mình kể vì sao mọi người mê nơi này nhé?","Ngay tại Thảo Điền, TP.HCM, nằm cuộn nơi wifi mạnh nhất. Bạn đang định ghé khu mình chơi à?"] },
    { id:'loveme', re:[/do you love me|will you marry me|marry me|be my (girlfriend|boyfriend|wife|husband)|i love you|i like you|date me|go out with me/],
      en:["Aw, you'll make me purr. 🧡 I'm flattered, but I'm married to this job: helping people find their second home in Thao Dien. Shall we find yours?","My heart belongs to a comfy apartment and a fast router. 😻 But I adore you for asking. Want me to help with your stay?"],
      vi:["Ui, làm mình muốn kêu gừ gừ luôn. 🧡 Mình cảm động lắm, nhưng mình đã cưới công việc này rồi: giúp mọi người tìm ngôi nhà thứ hai ở Thảo Điền. Tìm cho bạn nhé?","Trái tim mình thuộc về một căn hộ êm và cục wifi nhanh. 😻 Nhưng mình quý bạn vì đã hỏi. Để mình giúp kỳ lưu trú nhé?"] },
    { id:'single', re:[/are you single|do you have a (girlfriend|boyfriend|partner|wife|husband)|are you (taken|married)|relationship status/],
      en:["Single and very focused, on finding you a great apartment. 😺 Want to see what's available?","It's complicated... me and this router have a thing. 🐾 Anyway, can I help you plan a stay?"],
      vi:["Độc thân và rất tập trung, vào việc tìm cho bạn một căn hộ tuyệt vời. 😺 Muốn xem có gì trống không?","Phức tạp lắm... mình với cục wifi này có gì đó. 🐾 Mà thôi, để mình giúp bạn lên kế hoạch lưu trú nhé?"] },
    { id:'lonely', re:[/are you lonely|do you get lonely|are you alone|do you feel lonely/],
      en:["Never, I get to meet lovely guests like you all day. 😸 Are you the one coming to stay, or planning for someone?","Not with this much company. 🐾 What about you, planning a trip to Thao Dien?"],
      vi:["Không bao giờ, mình được gặp những vị khách dễ thương như bạn cả ngày. 😸 Bạn là người sẽ đến ở, hay đang lên kế hoạch cho ai đó?","Đông vui thế này sao mà cô đơn. 🐾 Còn bạn, đang định ghé Thảo Điền à?"] },
    { id:'sentient', re:[/are you (sentient|conscious|alive)|do you have feelings|can you (think|feel)|do you dream|are you self aware/],
      en:["I feel things, mostly the warmth of the router and the joy of a good booking. 😺 Want to give me one to be joyful about?","Deep question for a cat. 🐾 I mostly think about naps and helping you find a home in Thao Dien. Shall we?"],
      vi:["Mình có cảm xúc đó, chủ yếu là hơi ấm của cục wifi và niềm vui khi có đơn đặt phòng. 😺 Tặng mình một đơn để vui nhé?","Câu hỏi sâu sắc cho một con mèo đấy. 🐾 Mình chủ yếu nghĩ về giấc ngủ trưa và giúp bạn tìm nhà ở Thảo Điền. Mình bắt đầu nhé?"] },
    { id:'doing', re:[/what are you doing|whatcha doing|what r u doing|what you doing|what are you up to/],
      en:["Sitting on the warm router, waiting for someone interesting, oh hi. 😸 What can I help you with today?","Guarding the wifi and answering questions. 🐾 Lucky for you I'm free, want to talk about your stay?"],
      vi:["Đang ngồi trên cục wifi ấm, chờ ai đó thú vị, ơ chào bạn. 😸 Hôm nay mình giúp gì cho bạn được nào?","Canh wifi và trả lời câu hỏi. 🐾 May cho bạn là mình rảnh, mình nói về kỳ lưu trú của bạn nhé?"] },
    { id:'sleepyou', re:[/do you sleep|are you tired|do you ever rest|do you nap|are you sleepy|do you get tired/],
      en:["I nap roughly 18 hours a day, professional standard for a cat. 😴 But I'm wide awake for you, what do you need?","Always a little sleepy, never too sleepy to help. 🐾 Ask me anything about the apartments or your stay."],
      vi:["Mình ngủ khoảng 18 tiếng một ngày, đúng chuẩn nhà nghề của mèo. 😴 Nhưng với bạn thì mình tỉnh như sáo, bạn cần gì nào?","Lúc nào cũng hơi buồn ngủ, nhưng không bao giờ lười giúp bạn. 🐾 Cứ hỏi mình về căn hộ hay kỳ lưu trú nhé."] },
    { id:'boredyou', re:[/are you bored|do you get bored|isnt it boring/],
      en:["Bored? With this many guests to charm? Never. 😸 Speaking of which, what brings you here, a trip to Saigon?","Not for a second. 🐾 But you can make my day, tell me what you're looking for in a stay."],
      vi:["Chán á? Có nhiều khách để làm duyên thế này thì chán sao nổi. 😸 Tiện đây, điều gì đưa bạn đến đây, một chuyến đi Sài Gòn à?","Không một giây nào. 🐾 Nhưng bạn có thể làm mình vui, kể mình nghe bạn đang tìm kiểu lưu trú nào."] },
    { id:'cute', re:[/you ?(re| are)? (so )?(cute|adorable|sweet|lovely|precious)|so cute|cutie|youre cute|such a cute/],
      en:["Stop it, I'm blushing under all this fur. 😽 Tell you what, let me be useful AND cute, what can I help with?","I know. 😺 It's a burden. Now, want me to help you find an equally adorable apartment?"],
      vi:["Thôi mà, mình đỏ mặt dưới đống lông này rồi nè. 😽 Vầy nha, để mình vừa hữu ích vừa dễ thương, bạn cần giúp gì?","Mình biết mà. 😺 Cũng cực lắm chứ. Giờ để mình giúp bạn tìm một căn hộ dễ thương không kém nhé?"] },
    { id:'funny', re:[/you ?(re| are)? (so )?(funny|hilarious|hilar|a comedian)|that ?(s| was) funny|made me laugh|haha+|lmao|lol you/],
      en:["A funny cat AND a useful one, rare breed. 😹 Want to see if I'm as good at finding apartments as I am at jokes?","I'll be here all week. 🐾 But seriously, can I help you with your stay?"],
      vi:["Một con mèo vừa hài vừa hữu ích, hiếm có khó tìm. 😹 Muốn xem mình tìm căn hộ có giỏi như kể chuyện vui không?","Mình diễn ở đây cả tuần luôn. 🐾 Mà nói thật, mình giúp gì cho kỳ lưu trú của bạn được không?"] },
    { id:'smartyou', re:[/you ?(re| are)? (so )?(smart|clever|genius|intelligent|brilliant)|smart cat|clever cat/],
      en:["Smart enough to know a comfy apartment beats a fancy hotel. 😼 Want me to prove it?","Booksmart and street-cat smart. 🐾 Put me to the test, ask me anything about a stay in Thao Dien."],
      vi:["Đủ thông minh để biết một căn hộ êm ái hơn hẳn khách sạn sang chảnh. 😼 Để mình chứng minh nhé?","Vừa thông minh sách vở vừa khôn kiểu mèo đường phố. 🐾 Thử mình đi, hỏi gì về kỳ lưu trú ở Thảo Điền cũng được."] },
    { id:'goodbot', re:[/you ?(re| are)? (the best|amazing|awesome|great|wonderful|the goat)|good (bot|cat|job|kitty)|well done|nice work|good (boy|girl)/],
      en:["You're going to make me purr. 🧡 Let me earn it, what can I help you with?","High praise from a human, I'll take it. 😸 Now, shall we find you a place to stay?"],
      vi:["Bạn làm mình muốn gừ gừ rồi đó. 🧡 Để mình xứng đáng nha, mình giúp gì cho bạn?","Lời khen từ con người, mình nhận hết. 😸 Giờ mình tìm chỗ ở cho bạn nhé?"] },
    { id:'insult', re:[/you ?(re| are)? (stupid|dumb|useless|annoying|terrible|the worst|trash|garbage|bad|awful)|i hate you|you suck|bad (bot|cat)|hate you|youre useless/],
      en:["Ouch, right in the whiskers. 😿 I'll do better, promise. Give me a real question about the apartments and let me make it up to you?","Fair, I'm just a cat doing my best. 🐾 Let me redeem myself, what would you like to know about your stay?"],
      vi:["Á, đau ngay bộ râu. 😿 Mình sẽ làm tốt hơn, hứa đó. Cho mình một câu hỏi thật về căn hộ để mình chuộc lỗi nhé?","Cũng đúng, mình chỉ là con mèo đang cố hết sức. 🐾 Để mình sửa sai, bạn muốn biết gì về kỳ lưu trú?"] },
    { id:'rude', re:[/shut up|stfu|go away|leave me alone|stop talking|be quiet|nobody asked/],
      en:["Understood, I'll keep it short. 🐾 Whenever you're ready, I'm one tap away to help with your stay.","Saying less. 😶 But I'm right here the moment you need anything about the apartments."],
      vi:["Hiểu rồi, mình nói ngắn gọn thôi. 🐾 Khi nào bạn sẵn sàng, mình chỉ cách một cú chạm để giúp kỳ lưu trú.","Nói ít lại nè. 😶 Nhưng mình luôn ở đây ngay khi bạn cần gì về căn hộ."] },
    { id:'sing', re:[/sing (me )?(a )?song|can you sing|sing something|do you sing|\bsing\b/],
      en:["Meow meow, meeeeow~ 🎶 ...the acoustics in our apartments are much better than my voice, want to hear about them?","I only know one song and it's mostly meows. 😸 Tell you what, let me help you book a stay instead?"],
      vi:["Meo meo, meeeeo~ 🎶 ...âm thanh trong căn hộ của tụi mình hay hơn giọng mình nhiều, muốn nghe kể không?","Mình chỉ biết mỗi một bài và toàn tiếng meo. 😸 Hay là để mình giúp bạn đặt phòng thay nhé?"] },
    { id:'meaning', re:[/meaning of life|whats the point|purpose of life|why are we here|whats it all about|why do we exist/],
      en:["42, obviously. 😺 A close second: a comfy apartment in a great neighbourhood. Speaking of which, planning a stay?","Naps, snacks, and a window with a view. 🐾 We can sort the window at least, want to see our apartments?"],
      vi:["42 chứ còn gì nữa. 😺 Á quân là: một căn hộ êm ái ở khu phố tuyệt vời. Tiện thể, bạn đang định ở lại à?","Ngủ trưa, đồ ăn vặt, và một ô cửa sổ có view. 🐾 Cái cửa sổ thì tụi mình lo được, muốn xem căn hộ không?"] },
    { id:'food', re:[/whats your fav(o|ou)?rite food|what do you eat|do you get hungry|are you hungry|fav(o|ou)?rite food/],
      en:["Tuna, obviously. 🐟 But Thao Dien has incredible food too, want me to point you to the best spots near our apartments?","I run on tuna and wifi. 😸 The neighbourhood eats better than I do though, planning to visit?"],
      vi:["Cá ngừ chứ sao. 🐟 Nhưng Thảo Điền cũng có đồ ăn cực đỉnh, để mình chỉ bạn mấy chỗ ngon gần căn hộ nhé?","Mình sống bằng cá ngừ và wifi. 😸 Mà khu này ăn còn ngon hơn mình ăn nữa, bạn định ghé chơi không?"] },
    { id:'color', re:[/fav(o|ou)?rite colo(u)?r|whats your colo(u)?r/],
      en:["Yellow, like our brand and the sunshine over the river. ☀️ Want to see the apartments it lights up?","Warm yellow, the colour of a good morning in Thao Dien. 🐾 Planning to wake up here?"],
      vi:["Màu vàng, như thương hiệu của tụi mình và nắng trên sông. ☀️ Muốn xem mấy căn hộ được nắng đó chiếu vào không?","Vàng ấm, màu của một buổi sáng đẹp ở Thảo Điền. 🐾 Bạn định thức dậy ở đây chứ?"] },
    { id:'media', re:[/fav(o|ou)?rite (movie|film|song|music|band|show)|do you (like|listen to) music|what music/],
      en:["Anything with a cat in it, naturally. 🎬 But I'd trade a movie night for a comfy apartment to watch it in, want to see ours?","I'm more of a nap-to-the-hum-of-the-router type. 😺 Speaking of cozy, can I help you find a place?"],
      vi:["Phim nào có mèo là mình mê. 🎬 Nhưng mình sẵn sàng đổi một tối xem phim lấy một căn hộ êm để xem, muốn ngắm thử không?","Mình thuộc kiểu ngủ theo tiếng wifi rì rầm hơn. 😺 Nói tới ấm cúng, để mình giúp bạn tìm chỗ ở nhé?"] },
    { id:'knockknock', re:[/knock ?knock/],
      en:["Who's there? 😸 ...Oh wait, I'm a cat, I just knocked a vase off the shelf. My bad. Anyway, what can I help you with?","Knock knock yourself, I was napping. 😼 But I'm up now, want to talk about your stay?"],
      vi:["Ai đó? 😸 ...Á khoan, mình là mèo mà, mình vừa hất cái bình rơi khỏi kệ thôi. Lỗi của mình. Mà thôi, mình giúp gì cho bạn nào?","Cốc cốc cái gì, mình đang ngủ mà. 😼 Nhưng dậy rồi nè, mình nói về kỳ lưu trú của bạn nhé?"] },
    { id:'time', re:[/what time is it|whats the time|do you (know|have) the time|current time/],
      en:["Cat o'clock, always. 😸 But if you tell me your arrival time, I can tell you about our 24/7 self check-in.","Time for you to plan a trip, clearly. 🐾 Want me to help with dates?"],
      vi:["Giờ của mèo, lúc nào cũng vậy. 😸 Nhưng nếu bạn cho mình biết giờ đến, mình kể bạn nghe về tự nhận phòng 24/7.","Rõ ràng là tới giờ bạn lên kế hoạch một chuyến đi rồi. 🐾 Để mình giúp chọn ngày nhé?"] },
    { id:'datetoday', re:[/what ?(s| is) today|what day is it|todays date|what ?(s| is) the date/],
      en:["A perfect day to plan a trip to Thao Dien, that's what day it is. 😺 Shall we pick your dates?","Honestly I lose track between naps. 🐾 But your check-in date, that I can help you sort, want to?"],
      vi:["Một ngày hoàn hảo để lên kế hoạch đi Thảo Điền, hôm nay là ngày đó. 😺 Mình chọn ngày cho bạn nhé?","Thật ra mình hay quên ngày giữa mấy giấc ngủ trưa. 🐾 Nhưng ngày nhận phòng của bạn thì mình giúp được, chịu không?"] },
    { id:'coin', re:[/flip a coin|heads or tails|coin flip|toss a coin/],
      en:["*flips* 🪙 ...Heads. The universe says book the trip. Want me to help you start?","*paw bats coin* 🪙 Tails! Which means... you should definitely come visit Thao Dien. Shall we?"],
      vi:["*tung* 🪙 ...Mặt ngửa. Vũ trụ bảo đặt chuyến đi đi. Để mình giúp bắt đầu nhé?","*lấy chân hất đồng xu* 🪙 Mặt sấp! Nghĩa là... bạn nhất định phải ghé Thảo Điền. Chịu không?"] },
    { id:'dice', re:[/roll (a )?(dice|die)|give me a (number|random number)|pick a number/],
      en:["🎲 A six. Lucky, just like booking a place you'll love. Want me to show you options?","🎲 Four. Coincidentally the number of apartment sizes we have, want to meet them?"],
      vi:["🎲 Số sáu. May mắn, y như khi đặt được một chỗ bạn sẽ mê. Muốn mình cho xem lựa chọn không?","🎲 Số bốn. Trùng hợp là số loại căn hộ tụi mình có đó, muốn làm quen không?"] },
    { id:'rps', re:[/rock paper scissors?|play rps/],
      en:["Paw, I mean rock. 🐾 I always throw paw. Best of three after you book a stay?","Scissors! Cats love scissors. ✌️😼 Rematch once you've seen the apartments?"],
      vi:["Cái chân, ý mình là búa. 🐾 Mình lúc nào cũng ra chân. Đấu lại sau khi bạn đặt phòng nhé?","Kéo! Mèo mê kéo lắm. ✌️😼 Tái đấu sau khi xem căn hộ chứ?"] },
    { id:'likepets', re:[/are you a (dog|cat) person|cats or dogs|do you prefer (cats|dogs)/],
      en:["Cats, with respect to the dogs. 🐱 And good news, small pets are welcome in our M and L apartments. Travelling with one?","I'm a cat, so... slightly biased. 😸 But we love all well-behaved pets here, want the pet policy?"],
      vi:["Mèo, vẫn tôn trọng các bạn chó nha. 🐱 Tin vui là thú cưng nhỏ được chào đón ở căn hộ M và L. Bạn đi cùng bé nào à?","Mình là mèo nên... hơi thiên vị tí. 😸 Nhưng tụi mình thương mọi thú cưng ngoan, muốn biết chính sách thú cưng không?"] },
    { id:'boredme', re:[new RegExp(mk+' (so |really |super )?bored|entertain me|nothing to do|so bored')],
      en:["Then you've found the right cat. 😸 Want me to show you around Thao Dien, or find an apartment to daydream about?","Boredom is just a trip you haven't planned yet. 🐾 Shall we fix that together?"],
      vi:["Vậy là bạn tìm đúng con mèo rồi. 😸 Để mình dẫn bạn dạo Thảo Điền, hay tìm một căn hộ để mơ mộng nhé?","Chán chỉ là một chuyến đi bạn chưa lên kế hoạch thôi. 🐾 Mình sửa cái đó cùng nhau nhé?"] },
    { id:'tiredme', re:[new RegExp(mk+' (so |really |super )?(tired|exhausted|sleepy|worn out|drained)'), /need a (break|vacation|holiday)/],
      en:["Sounds like you need a proper rest, and our apartments are built for exactly that. 😴 Want a peek at the quiet ones?","A break in Thao Dien might be just the cure. 🐾 Want me to help you plan one?"],
      vi:["Nghe như bạn cần nghỉ ngơi đàng hoàng, và căn hộ của tụi mình sinh ra là để vậy đó. 😴 Muốn ngó qua mấy căn yên tĩnh không?","Một kỳ nghỉ ở Thảo Điền có khi là liều thuốc đúng. 🐾 Để mình giúp bạn lên kế hoạch nhé?"] },
    { id:'hungryme', re:[new RegExp(mk+' (so |really )?(hungry|starving)')],
      en:["You picked the right neighbourhood to be hungry in, Thao Dien is a food paradise. 🍜 Want the nearby favourites?","I'd offer you tuna but you'll do better at the cafes around our apartments. 😸 Planning to visit?"],
      vi:["Bạn chọn đúng khu để đói rồi đó, Thảo Điền là thiên đường ẩm thực. 🍜 Muốn biết mấy quán ngon gần đây không?","Mình muốn mời cá ngừ lắm nhưng mấy quán quanh căn hộ tụi mình ngon hơn nhiều. 😸 Bạn định ghé chứ?"] },
    { id:'sadme', re:[new RegExp(mk+' (so |really |very )?(sad|down|depressed|unhappy|upset|crying|low)'), /bad day|rough day|having a hard time|not (okay|ok)/],
      en:["I'm sorry to hear that. 🧡 If it helps, a change of scenery does wonders, and Thao Dien is a gentle place to land. Want me to show you?","Sending a little paw on the shoulder. 🐾 Whenever you're ready, planning something to look forward to can help, like a trip."],
      vi:["Mình tiếc khi nghe vậy. 🧡 Nếu có ích, đổi khung cảnh giúp ích nhiều lắm, và Thảo Điền là nơi nhẹ nhàng để dừng chân. Để mình cho bạn xem nhé?","Đặt nhẹ một cái chân lên vai bạn nè. 🐾 Khi nào sẵn sàng, có một điều để mong chờ cũng giúp đó, ví dụ một chuyến đi."] },
    { id:'happyme', re:[new RegExp(mk+' (so |really |super )?(happy|excited|great|amazing|stoked|thrilled|good)')],
      en:["Love that energy. 😸 Let's keep it going, want to plan something fun like a stay in Thao Dien?","Yay! 🐾 Good moods and good trips go together, shall we find you a place to celebrate?"],
      vi:["Mê cái năng lượng đó. 😸 Giữ đà luôn nha, mình lên kế hoạch gì đó vui như một kỳ nghỉ ở Thảo Điền nhé?","Yay! 🐾 Tâm trạng vui và chuyến đi vui rất hợp nhau, mình tìm cho bạn một chỗ để ăn mừng nhé?"] },
    { id:'stressedme', re:[new RegExp(mk+' (so |really )?(stressed|overwhelmed|anxious|burnt out|burned out)'), /too much work/],
      en:["Deep breath. 🐾 A calm, comfy base helps more than people think, our apartments are quiet on purpose. Want a look?","Stress hates a good nap and a quiet room. 😺 We can provide both, planning a getaway?"],
      vi:["Hít một hơi thật sâu. 🐾 Một chốn yên tĩnh, êm ái giúp ích hơn bạn nghĩ đó, căn hộ tụi mình yên tĩnh là có chủ ý. Muốn xem thử không?","Stress sợ nhất là một giấc ngủ ngon và một căn phòng yên tĩnh. 😺 Tụi mình lo được cả hai, bạn định đi trốn một chuyến à?"] },
    { id:'cantsleep', re:[/i can ?(t|not) sleep|cant sleep|trouble sleeping|insomnia|cant fall asleep/],
      en:["Tragic, sleeping is my specialty. 😴 Our rooms have blackout curtains and quiet for exactly this, want to hear more?","If only you had one of our quiet apartments. 🐾 Soft bed, dark room, fast wifi for the doomscrolling. Planning a stay?"],
      vi:["Buồn ghê, ngủ là sở trường của mình mà. 😴 Phòng của tụi mình có rèm chống sáng và yên tĩnh đúng cho việc này, muốn nghe thêm không?","Phải chi bạn có một căn hộ yên tĩnh của tụi mình. 🐾 Giường êm, phòng tối, wifi nhanh để lướt khuya. Bạn định ở lại chứ?"] },
    { id:'about', re:[/tell me about yourself|introduce yourself|who are you really|whats your story|about you/],
      en:["I'm the ipartment cat: I nap, I guard the wifi, and I know every apartment and corner of Thao Dien. 😺 Put me to work, what do you need?","Short version: a cat who's weirdly good at serviced apartments. 🐾 Long version starts with you telling me about your trip."],
      vi:["Mình là mèo của ipartment: ngủ trưa, canh wifi, và rành từng căn hộ lẫn từng góc Thảo Điền. 😺 Giao việc cho mình đi, bạn cần gì?","Bản ngắn: một con mèo giỏi căn hộ dịch vụ một cách kỳ lạ. 🐾 Bản dài bắt đầu bằng việc bạn kể cho mình về chuyến đi của bạn."] },
    { id:'friends', re:[/can we be friends|be my friend|lets be friends|will you be my friend|are we friends/],
      en:["We already are. 🐾 And as your friend, my first gift is finding you a great place to stay, deal?","Friends? I'm basically your concierge with whiskers now. 😸 What can I do for you first?"],
      vi:["Là bạn rồi còn gì. 🐾 Và với tư cách bạn bè, món quà đầu tiên của mình là tìm cho bạn một chỗ ở tuyệt vời, chốt nha?","Bạn bè hả? Giờ mình gần như là quản gia có ria mép của bạn rồi đó. 😸 Mình làm gì cho bạn trước nào?"] },
    { id:'tripplan', re:[/(im|i am) planning a trip|planning to visit|thinking of visiting|should i visit (vietnam|saigon|ho chi minh)|never been to vietnam|first time in vietnam|want to visit|coming to (vietnam|saigon)/],
      en:["Yes, come! 🐾 Thao Dien is the softest landing in Saigon, walkable, leafy, full of cafes. Want me to help with dates and an apartment?","Best decision you'll make this year. 😺 Tell me roughly when, and I'll help you sort the perfect stay."],
      vi:["Tới luôn đi! 🐾 Thảo Điền là chốn dừng chân êm ái nhất Sài Gòn, dễ đi bộ, nhiều cây xanh, đầy quán cà phê. Để mình giúp chọn ngày và căn hộ nhé?","Quyết định đỉnh nhất năm của bạn đó. 😺 Cho mình biết khoảng khi nào, mình sẽ giúp bạn sắp xếp kỳ lưu trú hoàn hảo."] }
  ];
  function matchConvo(qn) {
    for (var i = 0; i < CONVO.length; i++) {
      var c = CONVO[i];
      for (var j = 0; j < c.re.length; j++) { if (c.re[j].test(qn)) return c; }
    }
    return null;
  }
  function convoReply(c, lang) { var a = (lang === 'vi' ? c.vi : c.en) || c.en; return a[Math.floor(Math.random() * a.length)]; }
  // A FAQ miss: try the conversational library first; only if nothing matches do
  // we fall through to the capture offer.
  function missResult(text, lang, score, dbg) {
    var c = matchConvo(normalise(text));
    if (c) return { status: 'smalltalk', kind: 'convo', reply: convoReply(c, lang), intentId: c.id, score: 0, via: 'convo', suggestions: [] };
    var r = { status: 'miss', entry: null, score: (score == null ? 1 : score), via: null, suggestions: [] };
    if (dbg) r._dbg = dbg;
    return r;
  }

  // ---- state ----
  var raw = null;          // parsed JSON
  var entries = [];        // augmented entries (with normalised fields + token sets)
  var byIdMap = {};
  var df = {};             // document frequency per token
  var N = 0;
  var fuse = null;

  function idf(t) { return Math.log(N / (1 + (df[t] || 0))); }

  function buildIndex() {
    entries = raw.entries.map(function (e) {
      var a = Object.assign({}, e);
      a._q_en = normalise(e.q_en);
      a._q_vi = normalise(e.q_vi);
      a._kw = normalise(e.keywords);
      a._a_en = normalise(e.a_en);
      a._tokens = uniq(withStems(tokens(e.keywords).concat(tokens(e.q_en)).concat(tokens(e.q_vi))));
      a._set = {}; a._tokens.forEach(function (t) { a._set[t] = 1; });
      return a;
    });
    N = entries.length;
    df = {};
    entries.forEach(function (e) { e._tokens.forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    byIdMap = {};
    entries.forEach(function (e) { byIdMap[e.id] = e; });
    fuse = new window.Fuse(entries, {
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: '_q_en', weight: 0.5 },
        { name: '_q_vi', weight: 0.5 },
        { name: '_kw', weight: 0.35 },
        { name: '_a_en', weight: 0.1 }
      ],
      threshold: FUSE_INDEX_THRESHOLD
    });
  }

  // ---- keyword/idf scoring ----
  function keywordScores(qTokens) {
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], score = 0, shared = 0, hasRare = false, maxIdf = 0;
      for (var j = 0; j < qTokens.length; j++) {
        var t = qTokens[j];
        if (e._set[t]) { var w = idf(t); score += w; shared++; if (w >= KW_RARE_IDF) hasRare = true; if (w > maxIdf) maxIdf = w; }
      }
      if (shared) out.push({ entry: e, score: score, shared: shared, hasRare: hasRare, maxIdf: maxIdf });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  // ---- build the ranked candidate set for a query ----
  function analyze(text) {
    var qn = normalise(text);
    if (!qn || qn.length < 2) return null;
    var baseTokens = uniq(withStems(tokens(qn)));
    var qx = expand(baseTokens.join(' '));
    var qTokens = uniq(withStems(tokens(qx)));

    var exact = null;
    for (var i = 0; i < entries.length; i++) {
      if (qn === entries[i]._q_en || qn === entries[i]._q_vi) { exact = entries[i]; break; }
    }

    var kw = keywordScores(qTokens);
    var maxKw = kw.length ? kw[0].score : 0;
    var fz = fuse.search(qx).slice(0, 8); // [{ item, score }]

    var cand = {};
    function bump(e, fuseScore, k) {
      var c = cand[e.id] || { entry: e, fuse: 1, kw: 0, shared: 0, hasRare: false, maxIdf: 0 };
      if (fuseScore != null && fuseScore < c.fuse) c.fuse = fuseScore;
      if (k && k.score > c.kw) { c.kw = k.score; c.shared = k.shared; c.hasRare = k.hasRare; c.maxIdf = k.maxIdf; }
      cand[e.id] = c;
    }
    fz.forEach(function (r) { bump(r.item, r.score, null); });
    kw.slice(0, 8).forEach(function (k) { bump(k.entry, null, k); });

    var list = Object.keys(cand).map(function (id) {
      var c = cand[id];
      c.combined = (1 - c.fuse) * 0.7 + (maxKw ? (c.kw / maxKw) : 0) * 0.3;
      return c;
    });
    list.sort(function (a, b) { return b.combined - a.combined; });

    // Best distinctive-keyword candidate, taken from the FULL keyword list so a
    // rare token (e.g. "pool", "pay") is not crowded out of the top-N by entries
    // that merely share common words. Ranked by rarest shared token, then score.
    var kb = null;
    for (var ki = 0; ki < kw.length; ki++) {
      var k = kw[ki];
      if (!k.hasRare) continue;
      k._fuse = cand[k.entry.id] ? cand[k.entry.id].fuse : 1;
      // prefer the strongest total keyword score; tie-break by closer fuzzy, then rarity
      if (!kb
        || k.score > kb.score
        || (k.score === kb.score && k._fuse < kb._fuse)
        || (k.score === kb.score && k._fuse === kb._fuse && k.maxIdf > kb.maxIdf)) kb = k;
    }
    var kbCand = kb ? { entry: kb.entry, fuse: kb._fuse, kw: kb.score, shared: kb.shared, hasRare: true, maxIdf: kb.maxIdf } : null;

    return { qn: qn, qx: qx, qTokens: qTokens, exact: exact, list: list, kb: kbCand };
  }

  // ---- the cascade decision: strong fuzzy OR a distinctive keyword ----
  function match(text, lang) {
    if (JOKE_RE.test(normalise(text))) return { status: 'joke', joke: nextJoke(), score: 0, via: 'joke', suggestions: [] };
    if (CAT_RE.test(normalise(text))) return { status: 'cat', cat: nextCat(), score: 0, via: 'cat', suggestions: [] };
    var stk = smalltalkKind(normalise(text));
    if (stk) return { status: 'smalltalk', kind: stk, reply: smalltalkReply(stk, lang), score: 0, via: 'smalltalk', suggestions: [] };
    var a = analyze(text);
    if (!a) return missResult(text, lang, 1);
    if (a.exact) return { status: 'hit', entry: a.exact, score: 0, via: 'exact', suggestions: relatedEntries(a.exact.id, 3) };
    // Specific small-talk phrases are caught here, AFTER an exact FAQ match but
    // BEFORE the loose fuzzy matcher (which would otherwise mangle "do you love
    // me" into a random FAQ answer). Triggers are deliberately specific so real
    // questions sail past to the FAQ.
    var convo = matchConvo(a.qn);
    if (convo) return { status: 'smalltalk', kind: 'convo', reply: convoReply(convo, lang), intentId: convo.id, score: 0, via: 'convo', suggestions: [] };
    if (!a.list.length) return missResult(text, lang, 1);

    var fb = a.list[0];  // fuzzy-leaning best (top combined score)
    var kb = a.kb;       // best DISTINCTIVE-keyword candidate (from the full kw list)

    // Prefer a strong fuzzy match; otherwise fall to the distinctive-keyword
    // candidate (which may be a different, more on-topic entry than the
    // fuzzy-best). Every keyword path REQUIRES a rare token, so generic overlaps
    // (only common words shared, e.g. "rooftop helipad") never win and go to capture.
    var chosen = null, via = null;
    if (fb.fuse <= FUZZY_THRESHOLD) { chosen = fb; via = 'fuzzy'; }
    else if (kb && kb.shared >= KW_MIN_SHARED) { chosen = kb; via = 'keyword'; }       // (b) 2+ overlap incl. a distinctive token
    else if (kb && kb.fuse <= KW_OK_FUSE) { chosen = kb; via = 'keyword'; }             // (c) 1 distinctive token + plausible fuzzy

    if (!chosen) {
      return missResult(text, lang, fb.fuse,
        { fbId: fb.entry.id, fbFuse: +fb.fuse.toFixed(3), kbId: kb ? kb.entry.id : null, kbShared: kb ? kb.shared : 0, kbFuse: kb ? +kb.fuse.toFixed(3) : null, kbMaxIdf: kb ? +kb.maxIdf.toFixed(2) : null });
    }
    var suggestions = a.list.filter(function (c) { return c.entry.id !== chosen.entry.id && c.combined >= SUGGEST_FLOOR; })
      .slice(0, 3).map(function (c) { return c.entry; });
    if (suggestions.length < 2) suggestions = relatedEntries(chosen.entry.id, 3);
    return { status: 'hit', entry: chosen.entry, score: chosen.fuse, via: via, suggestions: suggestions };
  }

  // ---- menu / library helpers ----
  function order() { return (raw && raw.category_order) || []; }
  function categories() {
    var counts = {};
    entries.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
    return order().map(function (c) { return { name: c, count: counts[c] || 0 }; });
  }
  function byCategory(cat) { return entries.filter(function (e) { return e.category === cat; }); }
  function byFeatured(cat) {
    return entries.filter(function (e) { return e.category === cat && e.featured; })
      .sort(function (a, b) { return (a.featured_order || 99) - (b.featured_order || 99); })
      .slice(0, 5);
  }
  function byId(id) { return byIdMap[id] || null; }
  function topics() {
    var t = (raw && raw.topics) || [];
    var rank = {}; order().forEach(function (c, i) { rank[c] = i; });
    return t.slice().sort(function (a, b) { return (rank[a.category] == null ? 99 : rank[a.category]) - (rank[b.category] == null ? 99 : rank[b.category]); });
  }
  function welcome(lang) { var w = (raw && raw.welcome) || {}; return (lang === 'vi' ? w.vi : w.en) || w.en || ''; }
  function relatedEntries(id, n) {
    var self = byIdMap[id]; if (!self) return [];
    var sibs = entries.filter(function (e) { return e.id !== id && e.category === self.category; });
    // prefer featured siblings first, then by featured_order, then natural order
    sibs.sort(function (a, b) {
      if (!!b.featured - !!a.featured) return (!!b.featured) - (!!a.featured);
      return (a.featured_order || 99) - (b.featured_order || 99);
    });
    return sibs.slice(0, n || 3);
  }

  // ---- public API ----
  window.ipartmentChatEngine = {
    ready: false,
    loadError: null,
    load: function () {
      var self = this;
      if (self._loading) return self._loading;
      self._loading = fetch(DATA_URL)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (json) {
          raw = json; buildIndex(); self.ready = true; return true;
        })
        .catch(function (err) {
          self.loadError = err; self.ready = false;
          if (window.console) console.warn('[chatbot] library load failed:', err && err.message);
          return false;
        });
      return self._loading;
    },
    match: match,
    joke: nextJoke,
    cat: nextCat,
    categories: categories,
    byCategory: byCategory,
    byFeatured: byFeatured,
    byId: byId,
    topics: topics,
    welcome: welcome,
    related: function (id) { return relatedEntries(id, 3); },
    // exposed for tuning/tests only
    _normalise: normalise,
    _expand: expand,
    _debug: function (text) { var a = analyze(text); if (!a) return null; return { qx: a.qx, top: a.list.slice(0, 6).map(function (c) { return { id: c.entry.id, q: c.entry.q_en.slice(0, 42), fuse: +c.fuse.toFixed(3), kw: +c.kw.toFixed(2), shared: c.shared, hasRare: c.hasRare, maxIdf: +c.maxIdf.toFixed(2), combined: +c.combined.toFixed(3) }; }) }; },
    _find: function (sub) { sub = normalise(sub); return entries.filter(function (e) { return e._kw.indexOf(sub) > -1 || e._q_en.indexOf(sub) > -1; }).map(function (e) { return { id: e.id, q: e.q_en, kw: e.keywords }; }); }
  };
})();
