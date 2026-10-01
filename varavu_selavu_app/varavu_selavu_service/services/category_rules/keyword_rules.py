"""Keyword rules for descriptions that don't name a known merchant.

Each (main, sub) maps to phrases with weights. Phrases are matched as whole
words against normalize_text() output; a trailing "*" matches any word suffix
("grocer*" -> grocery/groceries). Scores are summed per category and the best
wins, so a specific phrase outweighs a generic word: "gas bill" (Heat/gas, 3)
beats "gas" (Gas/fuel, 2), "car rental" (Car, 3) beats "rent*" (Rent, 2).

ITEM_KEYWORDS is a separate lexicon for receipt line items, which are short
and abbreviated ("BNLS CHKN BRST", "GV WHL MILK") — see categorizer.classify_item.
"""
from typing import Dict, List, Tuple

KEYWORD_RULES: Dict[Tuple[str, str], List[Tuple[str, float]]] = {
    ("Home", "Rent"): [("rent", 3), ("house rent", 4), ("apartment rent", 4), ("monthly rent", 4), ("lease", 2), ("landlord", 3), ("apartment", 1)],
    ("Home", "Mortgage"): [("mortgage*", 4), ("home loan", 4), ("escrow", 3), ("emi", 1)],
    ("Home", "Furniture"): [("furniture", 3), ("sofa", 3), ("couch", 3), ("dining table", 3), ("coffee table", 3), ("chair*", 2), ("desk", 2), ("bed frame", 3), ("mattress*", 3), ("dresser", 3), ("bookshel*", 3), ("wardrobe", 3), ("cabinet*", 2), ("recliner", 3)],
    ("Home", "Electronics"): [("laptop*", 3), ("tv", 2), ("television", 3), ("monitor", 2), ("headphone*", 3), ("earbud*", 3), ("airpods", 3), ("iphone", 3), ("ipad", 3), ("macbook", 3), ("charger", 2), ("hdmi", 3), ("keyboard", 2), ("printer", 2), ("speaker*", 2), ("camera", 2), ("router", 2), ("ssd", 3), ("hard drive", 3), ("smart watch", 3), ("electronics", 3), ("gadget*", 2), ("phone case", 3), ("usb", 2)],
    ("Home", "Household supplies"): [("toilet paper", 3), ("paper towel*", 3), ("detergent", 3), ("dish soap", 3), ("trash bag*", 3), ("cleaning supplies", 4), ("bleach", 3), ("sponge*", 2), ("light bulb*", 3), ("batteries", 2), ("tissue*", 2), ("napkin*", 2), ("aluminum foil", 3), ("ziploc", 3), ("household", 3), ("home supplies", 3), ("kitchen supplies", 3), ("utensils", 2), ("cookware", 3), ("storage bins", 3), ("hangers", 2), ("stationery", 1)],
    ("Home", "Maintenance"): [("plumb*", 3), ("electrician", 3), ("repair*", 2), ("handyman", 3), ("paint", 2), ("hardware", 2), ("lumber", 3), ("tools", 2), ("hvac", 3), ("ac repair", 4), ("locksmith", 3), ("gardener", 3), ("lawn*", 3), ("landscap*", 3), ("roof*", 3), ("home improvement", 3), ("maintenance", 3), ("appliance repair", 4), ("hoa", 3), ("hoa dues", 4)],
    ("Home", "Pets"): [("pet", 2), ("pets", 2), ("dog", 2), ("cat", 1), ("vet", 3), ("veterinar*", 3), ("groom*", 2), ("kibble", 3), ("litter", 2), ("pet food", 4), ("dog food", 4), ("cat food", 4), ("dog walk*", 3), ("pet insurance", 2), ("boarding", 1)],
    ("Home", "Services"): [("storage unit", 4), ("movers", 3), ("moving", 2), ("security system", 3), ("pest control", 4), ("exterminator", 3), ("home service*", 3)],
    ("Home", "Other"): [("home decor", 3), ("decor", 2), ("plants", 1), ("garden*", 1)],
    ("Transportation", "Gas/fuel"): [("gas", 2), ("fuel", 3), ("petrol", 3), ("diesel", 3), ("gasoline", 3), ("fill up", 2), ("gas station", 4), ("ev charging", 3), ("charging station", 3), ("supercharg*", 3)],
    ("Transportation", "Car"): [("car", 2), ("oil change", 4), ("tire*", 3), ("tyre*", 3), ("car wash", 4), ("mechanic", 3), ("auto repair", 4), ("car repair", 4), ("smog", 3), ("registration", 1), ("vehicle registration", 4), ("dmv", 3), ("car payment", 4), ("car loan", 4), ("auto loan", 4), ("toll*", 3), ("rental car", 4), ("car rental", 4), ("auto parts", 3), ("brake*", 3), ("windshield", 3), ("detailing", 3), ("emission*", 3), ("car service", 4), ("vehicle", 2), ("auto", 1)],
    ("Transportation", "Parking"): [("parking", 4), ("park fee", 3), ("parking meter", 4), ("valet", 3), ("garage fee", 3), ("parking ticket", 4)],
    ("Transportation", "Plane"): [("flight*", 4), ("airfare", 4), ("airline*", 3), ("plane ticket*", 4), ("air ticket*", 4), ("baggage", 3), ("bag fee", 3), ("checked bag", 3), ("boarding pass", 3), ("seat upgrade", 2)],
    ("Transportation", "Bus/Train"): [("bus", 3), ("train", 3), ("metro", 2), ("subway ticket", 4), ("subway fare", 4), ("transit", 3), ("metrocard", 4), ("rail", 2), ("commute", 2), ("monthly pass", 2), ("tram", 3), ("ferry", 3), ("light rail", 3), ("bus pass", 4), ("train ticket", 4), ("caltrain", 4)],
    ("Transportation", "Taxi"): [("taxi", 4), ("cab", 3), ("rideshare", 4), ("ride share", 4), ("uber ride", 4), ("lyft ride", 4), ("ride to", 2), ("ride home", 3), ("ride from", 2), ("airport ride", 4), ("auto rickshaw", 4)],
    ("Transportation", "Hotel"): [("hotel*", 4), ("motel", 4), ("lodging", 4), ("inn", 1), ("resort", 3), ("hostel", 4), ("accommodation", 3), ("stay", 1), ("room booking", 3), ("vacation rental", 4)],
    ("Transportation", "Bicycle"): [("bike", 3), ("bicycle", 4), ("scooter", 3), ("cycling", 2), ("bike share", 4), ("e bike", 4)],
    ("Transportation", "Other"): [("travel", 2), ("trip", 1), ("luggage", 3), ("visa fee", 3), ("passport", 3), ("moving truck", 4)],
    ("Food & Drink", "Groceries"): [("grocer*", 4), ("supermarket", 4), ("vegetable*", 3), ("veggies", 3), ("fruit*", 2), ("produce", 3), ("milk", 2), ("eggs", 2), ("bread", 2), ("rice", 2), ("flour", 2), ("atta", 3), ("dal", 2), ("meat", 2), ("chicken breast", 3), ("fish market", 3), ("costco run", 4), ("farmers market", 4), ("indian store", 4), ("asian market", 4), ("provisions", 3), ("pantry", 2), ("food shopping", 4)],
    ("Food & Drink", "Dining out"): [("restaurant*", 4), ("dinner", 3), ("lunch", 3), ("breakfast", 3), ("brunch", 3), ("cafe", 3), ("coffee", 3), ("latte", 3), ("cappuccino", 3), ("espresso", 3), ("pizza", 3), ("burger*", 3), ("sushi", 3), ("taco*", 3), ("takeout", 3), ("take out", 3), ("food delivery", 4), ("dine", 2), ("dining", 3), ("food truck", 4), ("biryani", 3), ("dosa", 3), ("ramen", 3), ("pho", 3), ("boba", 3), ("bubble tea", 3), ("chai", 2), ("tea", 1), ("snack*", 2), ("ice cream", 3), ("dessert*", 3), ("bakery", 2), ("donut*", 3), ("doughnut*", 3), ("sandwich*", 3), ("wings", 2), ("bbq", 2), ("buffet", 3), ("meal", 2), ("food", 1), ("eat out", 4), ("eating out", 4), ("team lunch", 4), ("fast food", 4), ("chinese", 2), ("thai", 2), ("indian food", 3), ("mexican", 2), ("italian", 2), ("noodles", 2), ("curry", 2), ("fries", 2), ("smoothie", 2), ("juice", 1), ("kitchen", 2), ("grill", 3), ("bistro", 3), ("diner", 3), ("eatery", 3), ("cantina", 3), ("pizzeria", 3), ("taqueria", 3), ("steakhouse", 3), ("tavern", 2), ("deli", 2), ("trattoria", 3), ("brasserie", 3), ("canteen", 3), ("dhaba", 3), ("chaat", 3), ("sweets", 2)],
    ("Food & Drink", "Liquor"): [("beer*", 3), ("wine", 3), ("liquor", 4), ("alcohol", 4), ("vodka", 4), ("whiskey", 4), ("whisky", 4), ("rum", 3), ("tequila", 4), ("gin", 2), ("drinks", 2), ("bar", 2), ("bar tab", 4), ("pub", 3), ("brewery", 3), ("cocktail*", 3), ("happy hour", 3), ("spirits", 3), ("champagne", 3), ("sake", 2), ("booze", 4)],
    ("Entertainment", "Movies"): [("movie*", 4), ("cinema", 4), ("theater", 2), ("theatre", 2), ("film", 2), ("imax", 4), ("streaming", 2), ("popcorn", 1)],
    ("Entertainment", "Music"): [("concert*", 4), ("music", 3), ("album", 3), ("vinyl", 3), ("guitar", 3), ("piano", 2), ("gig", 2), ("music festival", 4)],
    ("Entertainment", "Games"): [("game", 2), ("games", 3), ("video game*", 4), ("gaming", 3), ("arcade", 3), ("board game*", 4), ("in game", 3), ("dlc", 3), ("vbucks", 4), ("robux", 4), ("escape room", 3), ("laser tag", 3)],
    ("Entertainment", "Sports"): [("gym", 4), ("fitness", 3), ("yoga", 3), ("pilates", 3), ("swim*", 2), ("golf", 3), ("tennis", 3), ("soccer", 3), ("football", 2), ("basketball", 3), ("cricket", 3), ("badminton", 3), ("pickleball", 3), ("climbing", 3), ("bouldering", 3), ("ski*", 2), ("snowboard*", 3), ("hiking", 2), ("workout", 3), ("sports", 3), ("bowling", 3), ("race registration", 4), ("5k", 3), ("personal trainer", 4), ("crossfit", 4), ("martial arts", 3), ("karate", 3), ("gym membership", 5)],
    ("Entertainment", "Other"): [("ticket*", 1), ("event*", 2), ("show", 1), ("museum", 3), ("zoo", 3), ("aquarium", 3), ("amusement park", 4), ("theme park", 4), ("festival", 2), ("party", 1), ("nightclub", 3), ("club", 1), ("karaoke", 3), ("book*", 1), ("magazine*", 2), ("comedy", 3), ("broadway", 4), ("play", 1), ("entertainment", 3), ("hobby", 2), ("vacation", 1), ("tour", 2), ("sightseeing", 3)],
    ("Life", "Medical expenses"): [("doctor", 4), ("dentist", 4), ("dental", 4), ("hospital", 4), ("clinic", 3), ("pharmacy", 4), ("medicine*", 4), ("medication*", 4), ("prescription*", 4), ("copay", 4), ("co pay", 4), ("lab test*", 4), ("blood test", 4), ("therapy", 3), ("therapist", 4), ("physio*", 4), ("chiropract*", 4), ("eye exam", 4), ("glasses", 2), ("contact lens*", 4), ("urgent care", 4), ("vaccin*", 4), ("x ray", 4), ("mri", 4), ("medical", 4), ("health", 2), ("checkup", 3), ("dermatolog*", 4), ("optometr*", 4), ("orthodont*", 4), ("vitamin*", 2), ("tylenol", 3), ("advil", 3), ("ibuprofen", 3)],
    ("Life", "Insurance"): [("insurance", 5), ("premium", 2), ("policy", 2), ("car insurance", 5), ("health insurance", 5), ("life insurance", 5), ("renters insurance", 5), ("home insurance", 5)],
    ("Life", "Taxes"): [("tax", 3), ("taxes", 4), ("irs", 4), ("property tax", 5), ("income tax", 5), ("tax filing", 5), ("tax return", 4), ("estimated tax", 5)],
    ("Life", "Education"): [("tuition", 4), ("school", 3), ("college", 3), ("university", 3), ("course*", 3), ("class", 2), ("classes", 2), ("textbook*", 4), ("tutor*", 4), ("exam fee", 4), ("exam", 2), ("certification", 3), ("training", 2), ("workshop", 2), ("lessons", 3), ("school supplies", 4), ("education", 4), ("learning", 2), ("school fee*", 5), ("coaching", 3)],
    ("Life", "Childcare"): [("daycare", 5), ("day care", 5), ("babysit*", 5), ("nanny", 5), ("childcare", 5), ("child care", 5), ("preschool", 5), ("diaper*", 3), ("baby", 2), ("kids", 1), ("after school", 4), ("summer camp", 4), ("formula", 1), ("toys", 2)],
    ("Life", "Clothing"): [("clothes", 4), ("clothing", 4), ("shirt*", 3), ("t shirt*", 3), ("tshirt*", 3), ("pants", 3), ("jeans", 3), ("dress", 2), ("shoes", 3), ("sneakers", 3), ("jacket", 3), ("coat", 2), ("socks", 3), ("underwear", 3), ("apparel", 4), ("hoodie", 3), ("sweater", 3), ("shorts", 2), ("saree", 3), ("sari", 3), ("kurta", 3), ("boots", 2), ("sandals", 3), ("outfit", 3), ("tailor*", 3), ("alterations", 3)],
    ("Life", "Gifts"): [("gift*", 4), ("present", 2), ("birthday", 2), ("wedding gift", 5), ("flowers", 3), ("bouquet", 3), ("donation*", 4), ("charity", 4), ("gift card", 5), ("anniversary", 2), ("baby shower", 3), ("housewarming", 3), ("tithe", 4), ("temple", 2), ("church", 2)],
    ("Life", "Other"): [("haircut", 4), ("hair cut", 4), ("salon", 4), ("barber", 4), ("spa", 3), ("massage", 3), ("nails", 3), ("manicure", 4), ("pedicure", 4), ("cosmetic*", 3), ("makeup", 3), ("skincare", 3), ("beauty", 3), ("waxing", 3), ("threading", 3), ("personal care", 3), ("toiletries", 2)],
    ("Utilities", "Electricity"): [("electricity", 5), ("electric bill", 5), ("power bill", 5), ("electric", 3), ("energy bill", 4), ("light bill", 4)],
    ("Utilities", "Heat/gas"): [("gas bill", 5), ("heating", 4), ("natural gas", 5), ("propane", 4), ("heating oil", 5), ("gas utility", 5)],
    ("Utilities", "Water"): [("water bill", 5), ("water", 2), ("sewer", 4), ("sewage", 4), ("water utility", 5)],
    ("Utilities", "Trash"): [("trash", 3), ("garbage", 4), ("waste", 3), ("recycling", 3), ("trash pickup", 5), ("dumpster", 4)],
    ("Utilities", "Cleaning"): [("laundry", 4), ("dry clean*", 5), ("cleaners", 3), ("laundromat", 5), ("maid", 4), ("house cleaning", 5), ("cleaning", 3), ("cleaning lady", 5), ("wash and fold", 5)],
    ("Utilities", "TV/Phone/Internet"): [("internet", 5), ("wifi", 4), ("wi fi", 4), ("broadband", 5), ("phone bill", 5), ("mobile bill", 5), ("cell phone", 3), ("cellphone", 3), ("cable", 2), ("cable bill", 5), ("tv bill", 5), ("recharge", 3), ("prepaid", 2), ("data plan", 4), ("phone plan", 4), ("wireless", 2), ("fiber", 2)],
    ("Utilities", "Other"): [("utilities", 4), ("utility bill", 4), ("utility", 3), ("bills", 1)],
    ("Other", "Services"): [("service fee", 3), ("shipping", 3), ("postage", 4), ("courier", 3), ("subscription", 2), ("software", 3), ("cloud storage", 4), ("bank fee", 4), ("atm fee", 4), ("late fee", 3), ("legal", 3), ("lawyer", 4), ("attorney", 4), ("accountant", 4), ("notary", 4), ("printing", 3), ("membership", 1), ("app", 1), ("domain", 2), ("hosting", 2), ("vpn", 3), ("fee", 1), ("stamps", 3), ("mail", 1)],
    ("Other", "General"): [("misc*", 3), ("shopping", 1), ("online order", 2), ("order", 1)],
}

# Receipt line-item lexicon. Includes the common receipt abbreviations
# (CHKN, BNLS, ORG, WHL, GV…) since items rarely print full words.
ITEM_KEYWORDS: Dict[Tuple[str, str], List[str]] = {
    ("Food & Drink", "Groceries"): [
        "milk", "egg", "eggs", "bread", "butter", "cheese", "yogurt", "yoghurt", "cream", "banana*", "apple*",
        "orange*", "grape*", "berr*", "strawberr*", "blueberr*", "lemon*", "lime*", "avocado*", "tomato*",
        "potato*", "onion*", "garlic", "ginger", "carrot*", "lettuce", "spinach", "broccoli", "cucumber*",
        "pepper*", "celery", "mushroom*", "corn", "beans", "peas", "cilantro", "kale", "cabbage", "cauliflower",
        "chicken", "chkn", "chk", "beef", "pork", "turkey", "bacon", "sausage*", "ham", "salmon", "shrimp",
        "tuna", "fish", "tilapia", "steak", "ground", "bnls", "brst", "breast", "thigh*", "wings", "rice",
        "flour", "sugar", "salt", "oil", "olive", "pasta", "noodle*", "cereal", "oats", "oatmeal", "granola",
        "cracker*", "chips", "cookie*", "snack*", "nuts", "almond*", "peanut*", "cashew*", "juice", "soda",
        "water", "sparkling", "coffee", "tea", "honey", "jam", "sauce", "ketchup", "mayo", "mustard", "salsa",
        "spice*", "masala", "dal", "atta", "paneer", "ghee", "tortilla*", "bagel*", "muffin*", "croissant*",
        "frozen", "frz", "ice cream", "pizza", "soup", "broth", "canned", "vinegar", "yeast", "baking",
        "org", "organic", "whl", "wht", "gv", "ks", "kirkland", "produce", "deli", "bakery", "dairy",
        "meat", "seafood", "fruit", "veg", "vegetable*", "lb", "kg", "oz", "gal", "dozen", "doz", "grocery",
        "pepsi", "coke", "sprite", "gatorade", "kombucha", "hummus", "tofu", "lentil*", "chickpea*",
    ],
    ("Food & Drink", "Liquor"): [
        "beer", "wine", "vodka", "whiskey", "whisky", "rum", "tequila", "gin", "bourbon", "ipa", "lager",
        "merlot", "cabernet", "chardonnay", "pinot", "sauvignon", "prosecco", "champagne", "seltzer*",
        "white claw", "truly", "modelo", "corona", "heineken", "budweiser", "bud light", "michelob",
        "coors", "stella", "sake", "liqueur", "brandy", "cognac", "scotch",
    ],
    ("Home", "Household supplies"): [
        "paper towel*", "toilet paper", "bath tissue", "tissue*", "napkin*", "detergent", "tide", "downy",
        "bleach", "clorox", "lysol", "dish soap", "dawn", "cascade", "sponge*", "trash bag*", "glad", "hefty",
        "foil", "ziploc", "wrap", "cleaner", "wipes", "swiffer", "bounty", "charmin", "kleenex", "batter*",
        "duracell", "energizer", "light bulb*", "bulb*", "air freshener", "febreze", "plates", "cups",
        "utensil*", "storage", "hanger*", "candle*", "shampoo", "conditioner", "body wash", "toothpaste",
        "toothbrush", "deodorant", "razor*", "soap", "lotion", "floss", "mouthwash", "cotton",
    ],
    ("Home", "Electronics"): [
        "tv", "hdmi", "usb", "cable", "charger", "headphone*", "earbud*", "airpods", "speaker", "laptop",
        "tablet", "ipad", "iphone", "phone", "keyboard", "mouse", "monitor", "printer", "ink", "toner",
        "sd card", "memory card", "flash drive", "ssd", "router", "adapter", "power bank", "smart watch",
        "roku", "fire stick", "echo", "alexa", "camera",
    ],
    ("Home", "Pets"): [
        "dog food", "cat food", "pet food", "kibble", "litter", "purina", "pedigree", "iams", "blue buffalo",
        "treats", "chew*", "flea", "pet",
    ],
    ("Life", "Medical expenses"): [
        "rx", "prescription", "pharmacy", "tylenol", "advil", "motrin", "ibuprofen", "acetaminophen",
        "aspirin", "claritin", "zyrtec", "allegra", "benadryl", "nyquil", "dayquil", "mucinex", "vitamin*",
        "supplement*", "bandage*", "band aid", "first aid", "thermometer", "cough", "cold", "allergy",
        "antacid", "tums", "pepcid", "melatonin", "probiotic*", "contact solution", "eye drops",
    ],
    ("Life", "Clothing"): [
        "shirt", "tee", "t shirt", "pants", "jeans", "dress", "shoes", "sneaker*", "jacket", "coat",
        "socks", "underwear", "bra", "hoodie", "sweater", "shorts", "leggings", "boots", "sandals",
        "hat", "cap", "gloves", "scarf", "belt", "apparel",
    ],
    ("Life", "Childcare"): [
        "diaper*", "pampers", "huggies", "baby wipes", "formula", "similac", "enfamil", "baby food",
        "pacifier", "sippy",
    ],
    ("Life", "Other"): [
        "makeup", "mascara", "lipstick", "nail polish", "skincare", "moisturizer", "sunscreen", "serum",
        "hair dye", "cosmetic*",
    ],
    ("Life", "Gifts"): ["gift card", "gift wrap", "greeting card", "card", "balloon*", "bouquet", "flowers"],
    ("Transportation", "Gas/fuel"): ["unleaded", "regular unl", "premium unl", "diesel", "fuel", "gas pump", "pump", "gallons"],
    ("Transportation", "Car"): ["motor oil", "wiper*", "antifreeze", "coolant", "car wash", "windshield"],
    ("Entertainment", "Games"): ["xbox", "playstation", "ps5", "nintendo", "switch", "game", "gift card xbox"],
    ("Entertainment", "Other"): ["book", "books", "magazine", "novel", "toy*", "lego"],
    ("Food & Drink", "Dining out"): [
        "combo", "meal", "burger", "fries", "sandwich", "latte", "cappuccino", "espresso", "mocha",
        "frappuccino", "americano", "entree", "appetizer", "app", "side", "refill", "tip", "gratuity",
        "taco*", "burrito*", "bowl", "wrap", "sub", "nugget*", "shake",
    ],
}
