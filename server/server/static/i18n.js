/* CrossPaths web client: translations.
 *
 * The English text in index.html is the key: T("Settings") returns the Arabic when the page is in
 * Arabic and the same English string otherwise, so a missing translation shows English, never a blank.
 *   T(text, {name: value})          fills {name} placeholders
 *   TP(n, one, other, vars)         plurals; Arabic has six forms, so AR[one] is {one, two, few, many, other}
 *   TE(message)                     translates a message that came back from the server
 *   H(handle)                       "@name", wrapped so it keeps its direction inside an Arabic sentence
 * Arabic is written in plain, everyday wording (close to how people actually talk) rather than formal
 * Modern Standard Arabic, and by meaning rather than word for word. Keep it that way when adding strings.
 * The language is the browser's unless the person picked one in Settings (kept on this device).
 */
(function (g) {
  "use strict";

  /* a plural entry: [one, two, few (3-10), many (11-99 / 100+)] */
  const pl = (one, two, few, many) => ({ one: one, two: two, few: few, many: many, other: many });

  const AR = {
    /* ---- general ---- */
    "Session expired, please sign in again": "انتهت الجلسة، سجّل دخولك من جديد",
    "Something went wrong ({status})": "صار خطأ ({status})",
    "Couldn't reach the server. Check your connection.": "ما قدرنا نوصل للسيرفر. تأكد من اتصالك بالإنترنت.",
    "Signed out": "تم تسجيل الخروج",
    "Sign out": "تسجيل الخروج",
    "Settings": "الإعدادات",
    "Done": "تم",
    "Delete": "حذف",
    "Remove": "إزالة",
    "Change": "غيّر",
    "Next": "التالي",
    "Previous": "السابق",
    "Back": "رجوع",
    "Send": "إرسال",
    "Search": "بحث",
    "Clear": "مسح",
    "All": "الكل",
    "Any": "أي مدة",
    "View": "عرض",
    "Review": "مراجعة",
    "Accept": "قبول",
    "Decline": "رفض",
    "Declined": "مرفوض",
    "Expired": "منتهي",
    "Got it": "تمام",
    "Auto": "تلقائي",
    "System": "النظام",
    "Dark": "داكن",
    "Light": "فاتح",
    "Language": "اللغة",
    "Theme": "المظهر",
    "Accent colour": "اللون الرئيسي",
    "Teal": "تركوازي", "Blue": "أزرق", "Violet": "بنفسجي", "Amber": "كهرماني", "Rose": "وردي",

    /* ---- crossing types, statuses, trust ---- */
    "Same place": "نفس المكان",
    "Crossed paths": "تقاطع طرق",
    "Travelled together": "سفر مع بعض",
    "awaiting consent": "بانتظار الموافقة",
    "pending": "معلّق",
    "running": "جاري",
    "done": "تم",
    "failed": "فشل",
    "declined": "مرفوض",
    "expired": "منتهي",
    "Looks authentic": "تبدو أصلية",
    "Some anomalies": "فيها شي غريب",
    "Looks unusual": "تبدو غير طبيعية",
    "Too little data": "بيانات قليلة",

    /* ---- retention wording ---- */
    "kept until you delete it": "محفوظ إلى أن تحذفه",
    "<1 h left": "باقي أقل من ساعة",
    "{n} h left": "باقي {n} ساعة",
    "{n} day left": pl("باقي يوم", "باقي يومين", "باقي {n} أيام", "باقي {n} يوم"),
    "Until I delete them": "إلى أن أحذفها",
    "24 hours": "24 ساعة",
    "7 days": "7 أيام",
    "30 days": "30 يوم",
    "{n} hour": pl("ساعة واحدة", "ساعتين", "{n} ساعات", "{n} ساعة"),
    "{n} day": pl("يوم واحد", "يومين", "{n} أيام", "{n} يوم"),
    "kept (encrypted) until you delete it": "محفوظ ومشفّر إلى أن تحذفه",
    "deleted {when} after you upload it": "ينحذف بعد {when} من رفعه",
    "at about the same time": "تقريبًا بنفس الوقت",
    "about {n} min apart": "بينكم حوالي {n} دقيقة",
    "{n} min": "{n} د",
    "{n} h": "{n} س",
    "{n} m": "{n} م",
    "{r} m · {w} min": "{r} م · {w} د",

    /* ---- sign in ---- */
    "Did our paths ever cross?": "هل سبق وتقاطعت طرقنا؟",
    "Sign in": "تسجيل الدخول",
    "Create account": "إنشاء حساب",
    "Username": "اسم المستخدم",
    "e.g. sara.k": "مثال: sara.k",
    "Password": "كلمة المرور",
    "(10+ characters)": "(10 أحرف أو أكثر)",
    "Invite code": "رمز الدعوة",
    "Registration is closed on this server.": "التسجيل مقفل على هذا السيرفر.",
    "Compare location histories (Google Maps Timeline, Strava, Apple Health, Garmin, Swarm, photos and more) with a friend or a stranger — see only the places and times you both were there. Your raw timeline is encrypted and, unless you choose otherwise, deleted {when} after you upload it.":
      "قارن سجلات المواقع (الخط الزمني من خرائط جوجل، Strava، صحة آبل، Garmin، Swarm، الصور وغيرها) مع صديق أو شخص غريب، وما تشوف إلا الأماكن والأوقات اللي كنتوا فيها مع بعض. ملف موقعك الأصلي يتشفّر وينحذف بعد {when} من رفعه، إلا إذا اخترت غير كذا.",

    /* ---- tabs ---- */
    "Uploads": "المرفوعات",
    "My Timeline": "خطي الزمني",
    "People": "الأشخاص",
    "Checks": "المقارنات",

    /* ---- uploads tab ---- */
    "Add your location history. It stays private and is {keep}.": "أضف سجل مواقعك. يبقى خاص، وهو {keep}.",
    "Import a timeline": "استيراد خط زمني",
    "Google Maps, Strava, Apple Health, Samsung Health, Garmin, Swarm, GPX, CSV…": "خرائط جوجل، Strava، صحة آبل، Samsung Health، Garmin، Swarm، GPX، CSV…",
    "Scan my photos": "افحص صوري",
    "Build one from the place and time saved in your photos.": "كوّن خط زمني من المكان والوقت المحفوظين في صورك.",
    "Where is your history from?": "من وين سجل مواقعك؟",
    "Choose file(s)": "اختر ملف أو أكثر",
    "One file, several at once, or a .zip · up to {mb} MB in total": "ملف واحد، أو عدة ملفات مرة وحدة، أو ملف zip · الحد الأقصى {mb} ميغابايت للكل",
    "Choose photos and CrossPaths reads the GPS position and time saved inside each one, right here in your browser. Only those points are uploaded, never the photos. Screenshots and photos sent through chat apps usually have no location and are skipped.":
      "اختر صور وCrossPaths يقرأ موقع GPS والوقت المحفوظين داخل كل صورة، هنا في المتصفح عندك. ما يترفع إلا هذي النقاط، والصور نفسها ما تترفع أبدًا. لقطات الشاشة والصور اللي تجي من تطبيقات المحادثة غالبًا ما فيها موقع، فنتجاهلها.",
    "Choose photos": "اختر صور",
    "Select as many as you like. At least 20 need a location.": "اختر كم ما تبي من الصور. لازم 20 صورة على الأقل فيها موقع.",
    "On an Android phone the CrossPaths app can scan your whole library in one go. On iPhone, some browsers remove the location from photos you pick; if none is found, try a computer.":
      "على جوال أندرويد، تطبيق CrossPaths يقدر يفحص مكتبة صورك كاملة مرة وحدة. على الآيفون، بعض المتصفحات تشيل الموقع من الصور اللي تختارها؛ إذا ما انلقى أي موقع جرّب من الكمبيوتر.",
    "No timeline uploaded yet.": "ما رفعت أي خط زمني بعد.",
    "{n} points": "{n} نقطة",
    "{n} pts": "{n} نقطة",
    "Home & work areas hidden from results ({n})": "مناطق البيت والدوام المخفية من النتائج ({n})",
    "Any crossing inside these areas is never shown. Remove an area only if you want places there included.": "أي تقاطع داخل هذي المناطق ما يظهر أبدًا. احذف المنطقة بس إذا تبي الأماكن اللي فيها تدخل في النتائج.",
    "Area {n}": "منطقة {n}",
    "None detected.": "ما اكتشفنا أي منطقة.",
    "Delete now": "احذف الآن",
    "That's {size} MB; the limit is {max} MB. Choose fewer files or a shorter period.": "الحجم {size} ميغابايت والحد الأقصى {max}. اختر ملفات أقل أو فترة أقصر.",
    "Reading and checking your timeline…": "نقرأ خطك الزمني ونفحصه…",
    "Reading and checking {n} files…": "نقرأ {n} ملف ونفحصها…",
    "Timeline added": "انضاف الخط الزمني",
    "{n} file had no locations": pl("ملف واحد بدون مواقع", "ملفين بدون مواقع", "{n} ملفات بدون مواقع", "{n} ملف بدون مواقع"),
    "Reading photo {i} of {n} · {k} with a location": "نقرأ الصورة {i} من {n} · {k} فيها موقع",
    "Only {n} of those photos have a location; at least 20 are needed. Choose more photos.": "بس {n} من هالصور فيها موقع، ونحتاج 20 على الأقل. اختر صور أكثر.",
    "None of those photos have a location saved in them. Try photos straight from the camera, or the Android app.": "ما فيه أي صورة من هذي الصور محفوظ فيها موقع. جرّب صور مباشرة من الكاميرا، أو تطبيق أندرويد.",
    "Delete this timeline from the server now?": "تحذف هذا الخط الزمني من السيرفر الآن؟",

    /* ---- people tab ---- */
    "Connect with someone to compare timelines. Nothing is compared until you both agree.": "اربط حسابك بشخص عشان تقارنون خطوطكم الزمنية. ما يتقارن شي إلا إذا وافقتوا الثنين.",
    "Meet in person": "لقاء مباشر",
    "With someone right now? Show your code for them to scan in the CrossPaths app, or share the link. You're connected and your paths are checked in one go.":
      "معك أحد الحين؟ اعرض رمزك عشان يمسحه بتطبيق CrossPaths، أو شاركه الرابط. تنربطون وتنقارن مساراتكم مرة وحدة.",
    "Show my code": "اعرض رمزي",
    "Enter a code": "أدخل رمز",
    "Or send a request by username - they accept, then either of you starts a check.": "أو أرسل طلب باسم المستخدم، وإذا قبل يقدر أي واحد منكم يبدأ المقارنة.",
    "Requests for you": "طلبات لك",
    "wants to compare timelines": "يبي يقارن خطوطكم الزمنية",
    "Block this user": "حظر هذا المستخدم",
    "Connections": "الأشخاص المضافون",
    "Check paths": "قارن المسارات",
    "Waiting for a reply": "بانتظار الرد",
    "No connections yet.": "ما أضفت أحد للحين.",
    "Request sent": "انرسل الطلب",
    "Remove this connection and any results with them?": "تشيله من قائمتك مع كل النتائج اللي بينكم؟",

    /* ---- meet in person ---- */
    "Your timeline for the check": "خطك الزمني للمقارنة",
    "You haven't uploaded a timeline, so you'll be connected but no check will run. Upload one first to check straight away.": "ما رفعت خط زمني، فبتنربطون بس بدون مقارنة. ارفع واحد أول إذا تبي المقارنة فورًا.",
    "Checking where your paths crossed…": "نشوف وين تقاطعت مساراتكم…",
    "Your paths never crossed": "مساراتكم ما تقاطعت أبدًا",
    "View crossings": "عرض التقاطعات",
    "The check couldn't run.": "ما قدرنا نكمل المقارنة.",
    "Connected with {who}": "تم الربط مع {who}",
    "Your code": "رمزك",
    "Ask them to open CrossPaths → People → <b>Meet in person</b> → Scan. Doing this together counts as both of you agreeing to the check; they'll only see when and roughly where you crossed.":
      "اطلب منه يفتح CrossPaths ← الأشخاص ← <b>لقاء مباشر</b> ← مسح. إذا سويتوها مع بعض نعتبره موافقة منكم الثنين على المقارنة، وهو ما يشوف إلا متى وتقريبًا وين تقاطعتوا.",
    "Copy invite link": "نسخ رابط الدعوة",
    "Share…": "مشاركة…",
    "Single use. The link works for someone on the same CrossPaths server as you.": "يُستخدم مرة وحدة. الرابط يشتغل مع اللي على نفس سيرفر CrossPaths حقك.",
    "Invite link copied": "تم نسخ رابط الدعوة",
    "Copy this link:": "انسخ هذا الرابط:",
    "Connect with me on CrossPaths and check if our paths crossed:": "اربط حسابك بحسابي في CrossPaths ونشوف إذا تقاطعت طرقنا:",
    "This code expired.": "انتهى هذا الرمز.",
    "New code": "رمز جديد",
    "Valid for {time}": "صالح لمدة {time}",
    "Enter their code": "أدخل رمزه",
    "Type the code shown on their phone, or paste their invite link.": "اكتب الرمز الظاهر في جواله، أو الصق رابط الدعوة.",
    "Using the CrossPaths phone app?": "تستخدم تطبيق CrossPaths على الجوال؟",
    "Open this invite in the app": "افتح الدعوة في التطبيق",
    "That isn't a CrossPaths code": "هذا مو رمز CrossPaths",
    "That's your own code. The other person needs to enter it.": "هذا رمزك أنت. الطرف الثاني هو اللي لازم يدخله.",
    "Connect with {who}?": "تربط حسابك مع {who}؟",
    "You'll be connected and your paths checked right away (within {r} m and {w} min). They'll only see when and roughly where you crossed.": "بتنربطون وتنقارن مساراتكم على طول (ضمن {r} متر و{w} دقيقة). وهو ما يشوف إلا متى وتقريبًا وين تقاطعتوا.",
    "You'll be connected. No check will run until you upload a timeline.": "بتنربطون. ما بتصير مقارنة إلا بعد ما ترفع خط زمني.",
    "You'll be connected. {who} hasn't uploaded a timeline, so no check will run yet.": "بتنربطون. {who} ما رفع خط زمني، فما بتصير مقارنة الحين.",
    "Connect & check": "اربط وقارن",
    "Connect": "اربط",

    /* ---- checks tab ---- */
    "Each check runs only after both of you agree.": "ما تبدأ أي مقارنة إلا إذا وافقتوا الثنين.",
    "No checks yet. Start one from People.": "ما فيه مقارنات للحين. ابدأ وحدة من تبويب الأشخاص.",
    "{who} wants to check paths with you": "{who} يبي يقارن مساراته بمسارك",
    "Waiting for {who} to agree · expires in {n} d": "بانتظار موافقة {who} · ينتهي بعد {n} يوم",
    "Finding where your paths crossed…": "ندوّر وين تقاطعت مساراتكم…",
    "No crossings found": "ما لقينا أي تقاطع",
    "{n} crossing found": pl("لقينا تقاطع واحد", "لقينا تقاطعين", "لقينا {n} تقاطعات", "لقينا {n} تقاطع"),
    "Something went wrong. Upload again and retry.": "صار خطأ. ارفع الخط الزمني من جديد وجرّب مرة ثانية.",
    "Delete this check and its results?": "تحذف هذي المقارنة ونتائجها؟",

    /* ---- new check / review ---- */
    "From (optional)": "من (اختياري)",
    "To (optional)": "إلى (اختياري)",
    "They will only see <b>when and roughly where</b> (about 100 m) your paths crossed — never your route or full timeline. Your home and work areas are excluded.": "ما يشوف إلا <b>متى وتقريبًا وين</b> (في حدود 100 متر) تقاطعت مساراتكم، وما يشوف مسارك ولا خطك الزمني كامل. مناطق البيت والدوام مستبعدة.",
    "Upload your timeline first": "ارفع خطك الزمني أول",
    "Check paths with {who}": "قارن مساراتك مع {who}",
    "Your timeline": "خطك الزمني",
    "Closeness: {v} m": "القرب: {v} متر",
    "Time tolerance: {v} min": "فارق الوقت: {v} دقيقة",
    "Send request & agree": "أرسل الطلب ووافق",
    "Upload your timeline first, then come back": "ارفع خطك الزمني أول، وبعدين ارجع",
    "{who} wants to check paths": "{who} يبي يقارن المسارات",
    "Closeness {r} m · time tolerance {w} min. Nothing runs until you agree.": "القرب {r} متر · فارق الوقت {w} دقيقة. ما يصير شي إلا إذا وافقت.",
    "Agree & run": "وافق وابدأ",
    "Request sent. It runs once they agree.": "انرسل الطلب. تبدأ المقارنة أول ما يوافق.",

    /* ---- results ---- */
    "Unnamed area": "منطقة بدون اسم",
    "{who}'s timeline looks unusual (possible fake or edited location data). Treat these results with caution.": "خط {who} الزمني يبدو غير طبيعي (ممكن بيانات موقع مزيفة أو معدّلة). خذ هالنتائج بحذر.",
    "Paths crossed with {who}": "التقاطعات مع {who}",
    "What do the types mean?": "وش معنى الأنواع؟",
    "Summary": "الملخص",
    "Map & list": "الخريطة والقائمة",
    "Couldn't load the map background.": "ما قدرنا نحمّل خلفية الخريطة.",
    "Check the server's internet access or MAP_STYLE_URL.": "تأكد من اتصال السيرفر بالإنترنت أو من إعداد MAP_STYLE_URL.",
    "Fit to the crossings": "اعرض كل التقاطعات",
    "Click a hot spot to zoom in": "اضغط على نقطة ساخنة عشان تقرّب",
    "Resize the results": "تغيير حجم النتائج",
    "Filter": "تصفية",
    "Newest": "الأحدث",
    "Oldest": "الأقدم",
    "Longest": "الأطول",
    "What the types mean": "وش معنى الأنواع",
    "You were both at the same spot (within {r} m), mostly staying put - a café, a mall, a mosque. You may have been there up to {w} min apart: one arriving as the other left.": "كنتوا الثنين في نفس المكان (ضمن {r} متر)، وغالبًا مستقرين فيه، مثل مقهى أو مجمّع أو مسجد. ممكن يكون بين وصولكم فرق يوصل لـ {w} دقيقة: واحد وصل والثاني كان يطلع.",
    "You were both on the move and went through the same spot within a few minutes of each other - walking or driving past. Over in a few minutes.": "كنتوا الثنين متحركين ومريتوا بنفس النقطة خلال دقايق من بعض، مثل المشي أو السواقة بجنب بعض. تنتهي في دقايق قليلة.",
    "You moved the same way at the same time for a while - the same road, bus or train.": "تحركتوا بنفس الاتجاه وبنفس الوقت لفترة، في نفس الطريق أو الباص أو القطار.",
    "Places are named from a database on your server (place names © <a href=\"https://www.geonames.org\" target=\"_blank\" rel=\"noopener\">GeoNames</a>, CC BY 4.0; street names © OpenStreetMap contributors). Times are rounded to 15 minutes and places blurred to about {m} m for privacy. Flights are never matched.":
      "أسماء الأماكن من قاعدة بيانات على سيرفرك (أسماء الأماكن © <a href=\"https://www.geonames.org\" target=\"_blank\" rel=\"noopener\">GeoNames</a>، رخصة CC BY 4.0؛ أسماء الشوارع © مساهمي OpenStreetMap). الأوقات تتقرّب لأقرب 15 دقيقة والأماكن تتشوّش لحدود {m} متر عشان الخصوصية. الرحلات الجوية ما تنقارن أبدًا.",

    /* ---- summary ---- */
    "Sun": "أحد", "Mon": "اثنين", "Tue": "ثلاثاء", "Wed": "أربعاء", "Thu": "خميس", "Fri": "جمعة", "Sat": "سبت",
    "Sundays": "الأحد", "Mondays": "الاثنين", "Tuesdays": "الثلاثاء", "Wednesdays": "الأربعاء", "Thursdays": "الخميس", "Fridays": "الجمعة", "Saturdays": "السبت",
    "Table": "جدول",
    "Chart": "رسم",
    "Your paths didn't cross within {r} m and {w} min.": "مساراتكم ما تقاطعت ضمن {r} متر و{w} دقيقة.",
    "within {r} m and {w} min": "ضمن {r} متر و{w} دقيقة",
    "time your paths crossed with {who}": pl("مرة تقاطعت فيها مساراتكم مع {who}", "مرات تقاطعت فيها مساراتكم مع {who}", "مرات تقاطعت فيها مساراتكم مع {who}", "مرة تقاطعت فيها مساراتكم مع {who}"),
    "Days you crossed": "أيام التقاطع",
    "busiest: {n} on {date}": "أكثر يوم: {n} في {date}",
    "Time together": "الوقت مع بعض",
    "about {n} days, all added up": "حوالي {n} يوم لو جمعناها",
    "all crossings added up": "مجموع كل التقاطعات",
    "Places": "الأماكن",
    "in {n} cities": "في {n} مدن",
    "in {city}": "في {city}",
    "tap to see": "اضغط للعرض",
    "By type": "حسب النوع",
    "Tap a type to see just those on the map.": "اضغط على نوع عشان تشوفه بس على الخريطة.",
    "What do they mean?": "وش معناها؟",
    "Where you cross most": "أكثر الأماكن اللي تتقاطعون فيها",
    "and {n} more place": pl("ومكان ثاني", "ومكانين ثانيين", "و{n} أماكن ثانية", "و{n} مكان ثاني"),
    "Cities": "المدن",
    "Crossings per month": "التقاطعات في الشهر",
    "Crossings per year": "التقاطعات في السنة",
    "Most in {when}: {n}": "الأكثر في {when}: {n}",
    "Month": "الشهر",
    "Year": "السنة",
    "Crossings": "التقاطعات",
    "{n} crossing": pl("تقاطع واحد", "تقاطعين", "{n} تقاطعات", "{n} تقاطع"),
    "Time of day": "وقت اليوم",
    "Most often around {time}": "غالبًا حوالي {time}",
    "Hour": "الساعة",
    "Day of week": "يوم الأسبوع",
    "Most often on {day}": "غالبًا يوم {day}",
    "Day": "اليوم",
    "Highlights": "أبرز التقاطعات",
    "First": "الأول",
    "Most recent": "الأحدث",
    "See all {n} on the map": "شوف الكل ({n}) على الخريطة",
    "Scroll left": "مرّر لليسار",
    "Scroll right": "مرّر لليمين",

    /* ---- settings ---- */
    "Your timelines stay on this server, encrypted, until you delete them on the Uploads tab.": "خطوطك الزمنية تبقى على هذا السيرفر مشفّرة إلى أن تحذفها من تبويب المرفوعات.",
    "Each timeline is deleted {when} after you upload it. Choosing a shorter time also deletes older ones straight away.": "كل خط زمني ينحذف بعد {when} من رفعه. وإذا اخترت مدة أقصر، تنحذف القديمة فورًا.",
    "Keep my uploaded timelines": "مدة حفظ خطوطي الزمنية",
    "This deletes {n} uploaded timeline(s) older than {when} now. Continue?": "بيتم حذف {n} من الخطوط الزمنية المرفوعة اللي أقدم من {when} الحين. تكمل؟",
    "Uploads are now deleted after {when}": "صارت المرفوعات تنحذف بعد {when}",
    "Uploads are now kept until you delete them": "صارت المرفوعات تنحفظ إلى أن تحذفها",

    /* ---- filters and list ---- */
    "No crossings": "ما فيه تقاطعات",
    "{n} of {total}": "{n} من {total}",
    "No crossings match these filters.": "ما فيه تقاطعات تناسب هالتصفية.",
    "Clear filters": "مسح التصفية",
    "Filter crossings": "تصفية التقاطعات",
    "Type": "النوع",
    "City": "المدينة",
    "Place": "المكان",
    "At least": "على الأقل",
    "{n}+ min": "{n}+ دقيقة",
    "Place or landmark contains": "المكان أو المعلم يحتوي على",
    "e.g. Olaya, airport, mall": "مثال: العليا، المطار، المجمّع",
    "Only crossings in the visible map area": "التقاطعات الظاهرة في الخريطة بس",
    "Show {n}": "عرض {n}",

    /* ---- one crossing ---- */
    "Looking up the street…": "ندوّر على اسم الشارع…",
    "OpenStreetMap is busy or refused the lookup. Try again later.": "OpenStreetMap مشغول أو رفض الطلب. جرّب بعدين.",
    "OpenStreetMap couldn't look that up.": "OpenStreetMap ما قدر يجيب النتيجة.",
    "No street name here": "ما فيه اسم شارع هنا",
    "Couldn't reach OpenStreetMap right now.": "ما قدرنا نوصل لـ OpenStreetMap الحين.",
    "All crossings": "كل التقاطعات",
    "Show street name": "اعرض اسم الشارع",
    "(asks OpenStreetMap)": "(يسأل OpenStreetMap)",
    "place accurate to about {n} m": "دقة المكان حوالي {n} متر",
    "Your path": "مسارك",
    "Replay": "إعادة",
    "Pause": "إيقاف مؤقت",
    "Only your own path is ever shown, never theirs.": "يظهر مسارك أنت بس، ومسار الثاني ما يظهر أبدًا.",
    "This result was saved by an older version, before your own path was kept with it. Run the check again to see how you got here and where you went.": "هذي النتيجة انحفظت بنسخة أقدم، قبل ما نحفظ مسارك معها. شغّل المقارنة مرة ثانية عشان تشوف كيف وصلت ووين رحت.",
    "No path of yours was recorded in the hours around this crossing.": "ما انسجّل أي مسار لك في الساعات حول هذا التقاطع.",

    /* ---- my timeline ---- */
    "My timeline": "خطي الزمني",
    "Upload your timeline first, on the Uploads tab.": "ارفع خطك الزمني أول من تبويب المرفوعات.",
    "Loading your timeline…": "نحمّل خطك الزمني…",
    "Show my current location": "اعرض موقعي الحالي",
    "Live": "مباشر",
    "Play": "تشغيل",
    "Search a place": "ابحث عن مكان",
    "See every time you've visited somewhere.": "شوف كل مرة زرت فيها مكان معيّن.",
    "Place name": "اسم المكان",
    "Typed search uses OpenStreetMap and sends your search text there.": "البحث بالكتابة يستخدم OpenStreetMap ويرسل له النص اللي تكتبه.",
    "Or tap a point on the map above": "أو اضغط على نقطة في الخريطة فوق",
    "Search radius: {v} m": "نطاق البحث: {v} متر",
    "Couldn't load your timeline: {err}": "ما قدرنا نحمّل خطك الزمني: {err}",
    "This timeline has no points to show.": "هذا الخط الزمني ما فيه نقاط للعرض.",
    "Loading {day}…": "نحمّل {day}…",
    "{n} point": pl("نقطة واحدة", "نقطتين", "{n} نقاط", "{n} نقطة"),
    "no points recorded": "ما فيه نقاط مسجّلة",
    "Couldn't load that day: {err}": "ما قدرنا نحمّل هذا اليوم: {err}",
    "Searching your timeline…": "ندوّر في خطك الزمني…",
    "No visits found there.": "ما لقينا أي زيارة هناك.",
    "Looking up \"{q}\"…": "ندوّر على \"{q}\"…",
    "No place found for \"{q}\".": "ما لقينا مكان باسم \"{q}\".",
    "Couldn't reach OpenStreetMap's search right now.": "ما قدرنا نوصل لبحث OpenStreetMap الحين.",
    "Tap the map to drop a pin…": "اضغط على الخريطة عشان تحط دبوس…",
    "Location isn't available in this browser": "الموقع غير متاح في هذا المتصفح",
    "Couldn't get your location — check the browser's location permission": "ما قدرنا نجيب موقعك. تأكد من صلاحية الموقع في المتصفح",

    /* ---- where to get a location history ---- */
    "Google Maps": "خرائط جوجل",
    "Apple Health": "صحة آبل",
    "Other apps": "تطبيقات ثانية",
    "Timeline export (.json)": "تصدير الخط الزمني (‎.json)",
    "Workout routes (GPX)": "مسارات التمارين (GPX)",
    "Exercise routes": "مسارات التمارين",
    "Check-ins": "تسجيلات الوصول",
    "Android: open <b>Settings → Location → Location services → Timeline</b> (or in Google Maps: profile picture → <b>Your Timeline</b> → ⚙️) and choose <b>Export Timeline data</b>.":
      "أندرويد: افتح <b>الإعدادات ← الموقع ← خدمات الموقع ← الخط الزمني</b> (أو من خرائط جوجل: صورة حسابك ← <b>الخط الزمني</b> ← ⚙️) واختر <b>تصدير بيانات الخط الزمني</b>.",
    "iPhone: Google Maps → profile picture → <b>Settings → Personal content → Export Timeline data</b>.":
      "آيفون: خرائط جوجل ← صورة حسابك ← <b>الإعدادات ← المحتوى الشخصي ← تصدير بيانات الخط الزمني</b>.",
    "Menu names vary a little between app versions. Choose the saved <i>.json</i> file here. Older Google Takeout downloads work too: <i>Records.json</i> or the <i>Semantic Location History</i> files (or the whole Takeout .zip).":
      "أسماء القوائم تختلف شوي بين نسخ التطبيق. اختر هنا ملف <i>.json</i> اللي انحفظ. وتنزيلات Google Takeout القديمة تشتغل برضو: ملف <i>Records.json</i> أو ملفات <i>Semantic Location History</i> (أو ملف Takeout الـ zip كامل).",
    "One activity: open it on strava.com → <b>⋯</b> → <b>Export GPX</b>.":
      "نشاط واحد: افتحه في strava.com ← <b>⋯</b> ← <b>Export GPX</b>.",
    "Everything: on strava.com go to <b>Settings → My Account → Download or Delete Your Account → Get Started → Request Your Archive</b>. Don't press anything else on that page. Strava emails you a link.":
      "كل شي: من strava.com روح لـ <b>Settings ← My Account ← Download or Delete Your Account ← Get Started ← Request Your Archive</b>. لا تضغط على أي شي ثاني في الصفحة. بيرسل لك Strava رابط على الإيميل.",
    "Upload the .zip as it is. If it's over the size limit (photos make it big), unzip it and choose the files inside the <i>activities</i> folder.":
      "ارفع ملف الـ zip زي ما هو. إذا تعدّى الحد الأقصى للحجم (الصور تكبّره)، فك الضغط واختر الملفات اللي داخل مجلد <i>activities</i>.",
    "On your iPhone open <b>Health</b> → your picture (top right) → <b>Export All Health Data</b> → save <i>export.zip</i> to Files.":
      "على الآيفون افتح <b>صحة (Health)</b> ← صورتك (فوق) ← <b>تصدير جميع بيانات الصحة</b> ← احفظ <i>export.zip</i> في الملفات.",
    "Upload <i>export.zip</i> here. Only the workout routes are read; your other health data is skipped.":
      "ارفع <i>export.zip</i> هنا. نقرأ مسارات التمارين بس، وباقي بياناتك الصحية نتجاهلها.",
    "Too big? Tap the zip in Files to unzip it, open <i>apple_health_export/workout-routes</i> and choose all the .gpx files there.":
      "كبير جدًا؟ اضغط على ملف الـ zip في تطبيق الملفات عشان تفكه، وافتح <i>apple_health_export/workout-routes</i> واختر كل ملفات .gpx اللي فيه.",
    "Only workouts recorded with GPS (outdoor walks, runs, rides) have routes.":
      "المسارات موجودة بس للتمارين المسجّلة بـ GPS (مشي أو ركض أو ركوب دراجة في الخارج).",
    "Open <b>Samsung Health</b> → ☰ or your profile → <b>Settings → Download personal data</b>.":
      "افتح <b>Samsung Health</b> ← ☰ أو ملفك الشخصي ← <b>الإعدادات ← تنزيل البيانات الشخصية</b>.",
    "The files go to <b>My Files → Internal storage → Download → Samsung Health</b>. Long-press that folder → <b>Compress</b> to make a .zip.":
      "الملفات تنحفظ في <b>ملفاتي ← وحدة التخزين الداخلية ← Download ← Samsung Health</b>. اضغط ضغطة طويلة على المجلد ← <b>ضغط</b> عشان تسوي zip.",
    "Upload the .zip. The routes are in the <i>location_data.json</i> files; everything else is skipped.":
      "ارفع ملف الـ zip. المسارات داخل ملفات <i>location_data.json</i>، وباقي الملفات نتجاهلها.",
    "One activity: Garmin Connect website → the activity → ⚙️ → <b>Export Original</b> (.fit, inside a .zip) or <b>Export to GPX</b>.":
      "نشاط واحد: موقع Garmin Connect ← النشاط ← ⚙️ ← <b>Export Original</b> (ملف .fit داخل zip) أو <b>Export to GPX</b>.",
    "Everything: Garmin account → <b>Data Management → Export Your Data</b>. Garmin emails you a .zip; upload it as it is.":
      "كل شي: حساب Garmin ← <b>Data Management ← Export Your Data</b>. بيرسل لك Garmin ملف zip على الإيميل، ارفعه زي ما هو.",
    "Fitbit: open a GPS exercise → <b>⋯</b> → <b>Export as TCX file</b> (one exercise at a time).":
      "Fitbit: افتح تمرين فيه GPS ← <b>⋯</b> ← <b>Export as TCX file</b> (تمرين واحد كل مرة).",
    "Google Fit: Google Takeout → choose only <b>Fit</b> → download. Upload the .zip; the activity .tcx files are read.":
      "Google Fit: من Google Takeout اختر <b>Fit</b> بس ← نزّل. ارفع ملف الـ zip، ونقرأ ملفات .tcx الخاصة بالأنشطة.",
    "Health Connect on Android has no route export. Export from the app that recorded the workout instead (Strava, Samsung Health, Garmin…).":
      "Health Connect في أندرويد ما فيه تصدير للمسارات. صدّر من التطبيق اللي سجّل التمرين (Strava، Samsung Health، Garmin…).",
    "In the <b>Swarm</b> app: <b>Settings → Privacy Settings → Initiate Data Download Request</b>. Foursquare emails you a link to a .zip.":
      "في تطبيق <b>Swarm</b>: <b>Settings ← Privacy Settings ← Initiate Data Download Request</b>. بيرسل لك Foursquare رابط ملف zip على الإيميل.",
    "Upload the .zip (or the <i>checkins*.json</i> files from it).":
      "ارفع ملف الـ zip (أو ملفات <i>checkins*.json</i> اللي داخله).",
    "Each check-in counts as 30 minutes at that place, so matches are rougher than with GPS tracks.":
      "كل تسجيل وصول نحسبه 30 دقيقة في المكان، فالمطابقة تكون أقل دقة من مسارات GPS.",
    "Any app that exports GPX, KML/KMZ, GeoJSON or FIT works: OwnTracks, GPSLogger, Dawarich, Arc, Komoot, Wikiloc, Polarsteps, car and dashcam apps…":
      "أي تطبيق يصدّر GPX أو KML/KMZ أو GeoJSON أو FIT يشتغل: OwnTracks وGPSLogger وDawarich وArc وKomoot وWikiloc وPolarsteps وتطبيقات السيارات وكاميرات السيارة…",
    "CSV files need a <b>latitude</b>, a <b>longitude</b> and a <b>time</b> column (any common column name works).":
      "ملفات CSV لازم فيها عمود <b>خط العرض</b> وعمود <b>خط الطول</b> وعمود <b>الوقت</b> (أي اسم شائع للعمود يمشي).",
    "Points without a time can't be compared, so planned routes without times are skipped.":
      "النقاط اللي بدون وقت ما تنقارن، فالمسارات المخططة بدون أوقات نتجاهلها."
  };

  /* Messages that come back from the server (they are English there). */
  const AR_SERVER = {
    "Please sign in": "سجّل دخولك",
    "Daily limit reached for this action. Try again tomorrow.": "وصلت للحد اليومي لهذا الإجراء. جرّب بكرة.",
    "Registration is closed": "التسجيل مقفل",
    "Invalid invite code": "رمز الدعوة غير صحيح",
    "Username must be 3-30 characters: letters, digits, _ or .": "اسم المستخدم من 3 إلى 30 خانة: حروف إنجليزية أو أرقام أو _ أو .",
    "Password must be at least 10 characters": "كلمة المرور لازم تكون 10 أحرف على الأقل",
    "That username is taken": "اسم المستخدم هذا مأخوذ",
    "Too many attempts. Wait 15 minutes.": "محاولات كثيرة. انتظر 15 دقيقة.",
    "Wrong username or password": "اسم المستخدم أو كلمة المرور غلط",
    "That isn't one of the choices this server allows": "هذا الخيار مو من الخيارات اللي يسمح فيها السيرفر",
    "Too many files at once (limit 2000). Zip them, or upload them in a few goes.": "ملفات كثيرة مرة وحدة (الحد 2000). اضغطها في ملف zip أو ارفعها على دفعات.",
    "That file contains too few location points to compare.": "هذا الملف فيه نقاط موقع قليلة ما تكفي للمقارنة.",
    "Upload not found": "ما لقينا الملف المرفوع",
    "That upload has expired. Please upload your timeline again.": "انتهت صلاحية هذا الملف. ارفع خطك الزمني من جديد.",
    "No user with that username": "ما فيه مستخدم بهذا الاسم",
    "That's you": "هذا أنت",
    "You already have a request or connection with this user": "عندك طلب أو ربط مع هذا المستخدم من قبل",
    "This request was declined recently. Try again later.": "انرفض هذا الطلب قريب. جرّب بعدين.",
    "Request not found": "ما لقينا الطلب",
    "Connection not found": "ما لقينا الشخص في قائمتك",
    "Check not found": "ما لقينا المقارنة",
    "Date range is empty": "الفترة الزمنية فاضية",
    "You can only check with accepted connections": "تقدر تقارن بس مع الأشخاص اللي قبلوا طلبك",
    "There is already an open check with this person": "فيه مقارنة مفتوحة مع هذا الشخص من قبل",
    "This check is no longer waiting for consent": "هذي المقارنة ما عادت تنتظر الموافقة",
    "You already consented": "سبق ووافقت",
    "That's your own code. The other person needs to scan it.": "هذا رمزك أنت. الطرف الثاني هو اللي لازم يمسحه.",
    "You can't connect with this person.": "ما تقدر تربط حسابك مع هذا الشخص.",
    "This code has expired or was already used. Ask for a new one.": "انتهى هذا الرمز أو انستخدم من قبل. اطلب رمز جديد.",
    "Not found": "غير موجود",
    "A check with them is already running.": "فيه مقارنة معه شغّالة الحين.",
    "Location fixes arrive at near-perfectly regular intervals": "نقاط الموقع توصل بفواصل زمنية منتظمة بشكل غير طبيعي",
    "Many duplicate timestamps": "فيه كثير أوقات مكررة",
    "Coordinates look artificially rounded": "الإحداثيات تبدو مقرّبة بشكل اصطناعي",
    "Identical accuracy value on nearly every fix": "قيمة الدقة نفسها تقريبًا في كل نقطة",
    "No anomalies detected (not a guarantee of authenticity)": "ما اكتشفنا أي شي غريب (وهذا مو ضمان إن البيانات أصلية)"
  };

  /* Server messages with a variable part. */
  const handles = s => s.replace(/@([\w.]+)/g, (m, h) => H(h));
  const AR_SERVER_RE = [
    [/^File too large \(limit (\d+) MB\)\./, m => "الملف كبير جدًا (الحد الأقصى " + m[1] + " ميغابايت). قصّر الفترة الزمنية أو ارفع بس الملفات اللي فيها مساراتك، وجرّب مرة ثانية."],
    [/^Couldn't find any time-stamped locations in (this file|these files)\./, m => "ما لقينا أي مواقع بأوقات في " + (m[1] === "this file" ? "هذا الملف" : "هذي الملفات") + ". استخدم تصدير الخط الزمني من خرائط جوجل، أو ملفات GPX وTCX وFIT وKML وGeoJSON وCSV اللي فيها أوقات (من Strava وصحة آبل وGarmin وSamsung Health وSwarm وتطبيقات مشابهة)."],
    [/^Connected\. No check ran because (.+?) (hasn't|haven't) got a timeline uploaded\./, m => "تم الربط. ما صارت مقارنة لأن " + handles(m[1]).replace(/ and /g, " و") + (m[2] === "hasn't" ? " ما رفع" : " ما رفعوا") + " خط زمني. ارفع واحد وبعدين اضغط «قارن المسارات»."],
  ];

  /* ---- language choice ---- */
  const KEY = "cp_lang";
  const stored = () => { try { const v = localStorage.getItem(KEY); return v === "ar" || v === "en" ? v : "auto"; } catch (e) { return "auto"; } };
  const deviceLang = () => /^ar\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || "") ? "ar" : "en";
  const LANG = stored() === "auto" ? deviceLang() : stored();
  const RTL = LANG === "ar";

  /* Dates are always Gregorian with Latin digits: an Arabic-language browser would otherwise show
     Hijri dates and Arabic-Indic digits next to the rest of the interface. */
  const UI_LOCALE = RTL ? "ar-SA-u-ca-gregory-nu-latn" : (/^en\b/i.test(navigator.language || "") ? navigator.language : "en-GB");

  let PR = null;
  try { PR = new Intl.PluralRules("ar"); } catch (e) { PR = { select: n => (n === 1 ? "one" : n === 2 ? "two" : n >= 3 && n <= 10 ? "few" : n >= 11 && n <= 99 ? "many" : "other") }; }

  const fill = (str, v) => (v ? str.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : str);
  const escHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function T(s, v) {
    const a = RTL ? AR[s] : null;
    return fill(typeof a === "string" ? a : s, v);
  }
  function TP(n, one, other, v) {
    const vars = Object.assign({ n: n }, v || {});
    const a = RTL ? AR[one] : null;
    if (a && typeof a === "object") {
      let c = PR.select(n); if (c === "zero") c = "other";
      return fill(a[c] || a.other, vars);
    }
    return fill(n === 1 ? one : other, vars);
  }
  function TE(msg) {
    msg = String(msg == null ? "" : msg);
    if (!RTL) return msg;
    if (AR_SERVER[msg]) return AR_SERVER[msg];
    for (const [re, f] of AR_SERVER_RE) { const m = msg.match(re); if (m) return f(m); }
    return msg;
  }

  g.CP_I18N = { AR: AR, AR_SERVER: AR_SERVER };   // exposed for the tests (tests/test_i18n.py)
  g.LANG = LANG;
  g.RTL = RTL;
  g.UI_LOCALE = UI_LOCALE;
  g.T = T; g.TP = TP; g.TE = TE;
  /* "@name" kept as one left-to-right unit inside an Arabic sentence (FSI … PDI isolates) */
  const H = handle => "⁨@" + escHtml(handle) + "⁩";
  g.H = H;
  g.num = n => Number(n).toLocaleString(UI_LOCALE);
  g.ARR = RTL ? "←" : "→";        // "from → to"
  g.BACK = RTL ? "→" : "←";       // the back button
  g.PREV = RTL ? "›" : "‹";       // previous / back one step
  g.NEXT = RTL ? "‹" : "›";       // next / go in
  g.langPref = stored;
  g.setLangPref = v => { try { if (v === "ar" || v === "en") localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } location.reload(); };
  g.applyStaticText = () => {
    document.documentElement.lang = LANG;
    document.documentElement.dir = RTL ? "rtl" : "ltr";
    document.querySelectorAll("[data-t]").forEach(el => { el.textContent = T(el.dataset.t); });
    document.querySelectorAll("[data-ta]").forEach(el => { const x = T(el.dataset.ta); el.setAttribute("aria-label", x); el.title = x; });
  };
  document.documentElement.lang = LANG;
  document.documentElement.dir = RTL ? "rtl" : "ltr";
})(window);
