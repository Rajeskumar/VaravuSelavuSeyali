"""seed merchant dictionary

Revision ID: fcc03f738abe
Revises: c0cf6118cdec
Create Date: 2026-07-17 09:15:00.000000

TS-ENT-104: curated global (is_global=TRUE, user_email=NULL) merchant
dictionary + common alias variants, per spec §13. Data-only migration —
self-contained (the merchant list lives in this file, not a runtime JSON
asset) so the whole change reviews as one diff and is versioned alongside the
schema it depends on.

`canonical_name` values are already in the same normalized form
EntityResolutionService.normalize() would produce (lowercase, punctuation
replaced with spaces, whitespace collapsed) — e.g. "Trader Joe's" needs the
apostrophe stripped to a space, not just removed ("trader joe s", not
"trader joes"), or a tier-1 exact match against a user typing the apostrophe
would silently miss. Names with a possessive apostrophe use the
no-apostrophe joined spelling as canonical_name (e.g. "mcdonalds") — the more
common/simpler typed form — with the apostrophe'd/split form added as an
explicit alias instead, matching how EntityResolutionService.normalize()
actually splits "McDonald's" into "mcdonald s" (a floating "s" token).
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import table, column


# revision identifiers, used by Alembic.
revision: str = 'fcc03f738abe'
down_revision: Union[str, None] = 'c0cf6118cdec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (canonical_name, display_name, [aliases])
# canonical_name is the normalized key; aliases are additional normalized
# variants (misspellings/abbreviations/OCR drift) that should also resolve
# here without ever hitting the fuzzy tiers.
MERCHANTS = [
    # Warehouse clubs
    # "whse" is already in the abbreviation map (-> "wholesale"), so a raw
    # "Costco Whse" normalizes straight to "costco wholesale" — no separate
    # alias needed for it.
    ("costco wholesale", "Costco Wholesale", ["costco", "cosco"]),
    ("sams club", "Sam's Club", ["sam s club", "sams", "sam s"]),
    ("bjs wholesale", "BJ's Wholesale Club", ["bj s wholesale", "bjs", "bj s"]),

    # Grocery / supermarket
    ("walmart", "Walmart", ["wal mart", "wm supercenter", "walmart supercenter", "wmt"]),
    ("target", "Target", ["tgt", "target corp"]),
    ("kroger", "Kroger", ["krogers", "kroger co"]),
    ("safeway", "Safeway", ["safeway inc"]),
    ("albertsons", "Albertsons", ["albertson s", "albertsons market"]),
    ("publix", "Publix", ["publix super market", "publix super markets"]),
    ("whole foods market", "Whole Foods Market", ["whole foods", "wholefds", "wfm"]),
    ("trader joes", "Trader Joe's", ["trader joe s", "tj", "trader js"]),
    ("aldi", "Aldi", ["aldi inc"]),
    ("wegmans", "Wegmans", ["wegmans food markets"]),
    ("heb", "H-E-B", ["h e b", "heb grocery"]),
    ("meijer", "Meijer", ["meijer inc"]),
    ("shoprite", "ShopRite", ["shop rite"]),
    ("stop and shop", "Stop & Shop", ["stop shop"]),
    ("giant eagle", "Giant Eagle", []),
    ("giant food", "Giant Food", ["giant"]),
    ("food lion", "Food Lion", []),
    ("winn dixie", "Winn-Dixie", ["winndixie"]),
    ("piggly wiggly", "Piggly Wiggly", []),
    ("sprouts farmers market", "Sprouts Farmers Market", ["sprouts"]),
    ("fred meyer", "Fred Meyer", []),
    ("ralphs", "Ralphs", ["ralph s"]),
    ("vons", "Vons", []),
    ("pavilions", "Pavilions", []),
    ("harris teeter", "Harris Teeter", []),
    ("hy vee", "Hy-Vee", ["hyvee"]),
    ("winco foods", "WinCo Foods", ["winco"]),
    ("save a lot", "Save A Lot", []),
    ("smiths food and drug", "Smith's Food and Drug", ["smith s"]),
    ("king soopers", "King Soopers", []),
    ("frys food", "Fry's Food", ["fry s food", "frys"]),
    ("qfc", "QFC", ["quality food centers"]),
    ("jewel osco", "Jewel-Osco", ["jewelosco"]),
    ("acme markets", "Acme Markets", ["acme"]),
    ("market basket", "Market Basket", []),
    ("hannaford", "Hannaford", []),
    ("price chopper", "Price Chopper", []),
    ("weis markets", "Weis Markets", ["weis"]),
    ("ingles markets", "Ingles Markets", ["ingles"]),
    ("lowes foods", "Lowes Foods", ["lowe s foods"]),
    ("food 4 less", "Food 4 Less", ["food4less"]),
    ("food city", "Food City", []),
    ("wholesale club", "Wholesale Club", []),

    # Pharmacy
    ("cvs pharmacy", "CVS Pharmacy", ["cvs", "cvs health"]),
    ("walgreens", "Walgreens", ["walgreens pharmacy"]),
    ("rite aid", "Rite Aid", ["riteaid"]),
    ("duane reade", "Duane Reade", []),

    # Discount / department
    ("kohls", "Kohl's", ["kohl s"]),
    ("marshalls", "Marshalls", ["marshall s"]),
    ("tj maxx", "T.J. Maxx", ["tjmaxx", "tjx"]),
    ("ross dress for less", "Ross Dress for Less", ["ross"]),
    ("burlington", "Burlington", ["burlington coat factory"]),
    ("big lots", "Big Lots", []),
    ("five below", "Five Below", []),
    ("dollar tree", "Dollar Tree", []),
    ("dollar general", "Dollar General", ["dg"]),
    ("family dollar", "Family Dollar", []),
    ("nordstrom", "Nordstrom", []),
    ("nordstrom rack", "Nordstrom Rack", []),
    ("macys", "Macy's", ["macy s"]),
    ("jcpenney", "JCPenney", ["jc penney", "jcp"]),

    # Home improvement / hardware
    ("home depot", "The Home Depot", ["the home depot", "homedepot"]),
    ("lowes", "Lowe's", ["lowe s", "lowes home improvement"]),
    ("menards", "Menards", []),
    ("ace hardware", "Ace Hardware", []),
    ("harbor freight tools", "Harbor Freight Tools", ["harbor freight"]),

    # Electronics / office
    ("best buy", "Best Buy", ["bestbuy"]),
    ("apple store", "Apple Store", ["apple"]),
    ("micro center", "Micro Center", []),
    ("gamestop", "GameStop", ["game stop"]),
    ("staples", "Staples", []),
    ("office depot", "Office Depot", ["officedepot"]),

    # Coffee / fast food / restaurants
    ("starbucks", "Starbucks", ["sbux", "starbucks coffee"]),
    ("dunkin", "Dunkin'", ["dunkin donuts"]),
    ("mcdonalds", "McDonald's", ["mcdonald s", "mcd"]),
    ("burger king", "Burger King", ["bk"]),
    ("wendys", "Wendy's", ["wendy s"]),
    ("taco bell", "Taco Bell", []),
    ("chick fil a", "Chick-fil-A", ["chickfila", "cfa"]),
    ("chipotle mexican grill", "Chipotle Mexican Grill", ["chipotle"]),
    ("subway", "Subway", []),
    ("kfc", "KFC", ["kentucky fried chicken"]),
    ("popeyes", "Popeyes", ["popeye s", "popeyes louisiana kitchen"]),
    ("panera bread", "Panera Bread", ["panera"]),
    ("panda express", "Panda Express", []),
    ("dominos pizza", "Domino's Pizza", ["domino s pizza", "dominos"]),
    ("pizza hut", "Pizza Hut", []),
    ("papa johns", "Papa John's", ["papa john s"]),
    ("five guys", "Five Guys", []),
    ("in n out burger", "In-N-Out Burger", ["in n out"]),
    ("shake shack", "Shake Shack", []),
    ("sonic drive in", "Sonic Drive-In", ["sonic"]),
    ("arbys", "Arby's", ["arby s"]),
    ("jack in the box", "Jack in the Box", []),
    ("whataburger", "Whataburger", []),
    ("culvers", "Culver's", ["culver s"]),
    ("dairy queen", "Dairy Queen", ["dq"]),
    ("jimmy johns", "Jimmy John's", ["jimmy john s"]),
    ("jersey mikes subs", "Jersey Mike's Subs", ["jersey mike s"]),
    ("wingstop", "Wingstop", []),
    ("raising canes", "Raising Cane's", ["raising cane s"]),
    ("zaxbys", "Zaxby's", ["zaxby s"]),
    ("dennys", "Denny's", ["denny s"]),
    ("ihop", "IHOP", []),
    ("waffle house", "Waffle House", []),
    ("cracker barrel", "Cracker Barrel", []),
    ("olive garden", "Olive Garden", []),
    ("applebees", "Applebee's", ["applebee s"]),
    ("chilis", "Chili's", ["chili s"]),
    ("outback steakhouse", "Outback Steakhouse", ["outback"]),
    ("buffalo wild wings", "Buffalo Wild Wings", ["bww"]),
    ("texas roadhouse", "Texas Roadhouse", []),

    # Gas stations / convenience
    ("shell", "Shell", ["shell oil"]),
    ("chevron", "Chevron", []),
    ("exxonmobil", "ExxonMobil", ["exxon", "mobil"]),
    ("bp", "BP", ["british petroleum"]),
    ("sunoco", "Sunoco", []),
    ("speedway", "Speedway", []),
    ("circle k", "Circle K", []),
    ("7 eleven", "7-Eleven", ["seven eleven", "711"]),
    ("wawa", "Wawa", []),
    ("quiktrip", "QuikTrip", ["qt"]),
    ("marathon", "Marathon", ["marathon petroleum"]),
    ("valero", "Valero", []),
    ("citgo", "Citgo", []),
    ("racetrac", "RaceTrac", []),
    ("caseys general store", "Casey's General Store", ["casey s"]),

    # Online / marketplace
    ("amazon", "Amazon", ["amzn", "amazon mktp", "amazon com"]),
    ("ebay", "eBay", []),
    ("etsy", "Etsy", []),
    ("walmart com", "Walmart.com", []),
    ("target com", "Target.com", []),

    # Airlines
    ("delta air lines", "Delta Air Lines", ["delta"]),
    ("american airlines", "American Airlines", ["aa"]),
    ("united airlines", "United Airlines", ["united"]),
    ("southwest airlines", "Southwest Airlines", ["southwest"]),
    ("jetblue", "JetBlue", ["jet blue"]),
    ("alaska airlines", "Alaska Airlines", []),
    ("spirit airlines", "Spirit Airlines", ["spirit"]),
    ("frontier airlines", "Frontier Airlines", ["frontier"]),

    # Ride-share / delivery
    ("uber", "Uber", []),
    ("lyft", "Lyft", []),
    ("doordash", "DoorDash", ["door dash"]),
    ("grubhub", "Grubhub", ["grub hub"]),
    ("instacart", "Instacart", []),
    ("uber eats", "Uber Eats", ["ubereats"]),

    # Streaming / subscriptions
    ("netflix", "Netflix", []),
    ("spotify", "Spotify", []),
    ("hulu", "Hulu", []),
    ("disney plus", "Disney+", ["disney"]),
    ("amazon prime", "Amazon Prime", []),
    ("hbo max", "HBO Max", []),
    ("apple music", "Apple Music", []),
    ("youtube premium", "YouTube Premium", []),

    # Bed / home goods / specialty retail
    ("bed bath and beyond", "Bed Bath & Beyond", ["bed bath beyond", "bbb"]),
    ("container store", "The Container Store", ["the container store"]),
    ("williams sonoma", "Williams Sonoma", []),
    ("pottery barn", "Pottery Barn", []),
    ("crate and barrel", "Crate & Barrel", ["crate barrel"]),
    ("ikea", "IKEA", []),
    ("hobby lobby", "Hobby Lobby", []),
    ("michaels", "Michaels", ["michael s"]),
    ("joann fabrics", "JOANN Fabrics", ["joann", "jo ann fabrics"]),
    ("petsmart", "PetSmart", ["pet smart"]),
    ("petco", "Petco", []),
    ("dicks sporting goods", "Dick's Sporting Goods", ["dick s sporting goods"]),
    ("rei", "REI", ["recreational equipment inc"]),
    ("academy sports and outdoors", "Academy Sports + Outdoors", ["academy sports"]),

    # Warehouse / misc grocery adjacent
    ("costco gas", "Costco Gas", []),
    ("sams club gas", "Sam's Club Gas", ["sams gas"]),
    ("trader joes wine", "Trader Joe's Wine Shop", ["trader joe s wine"]),
    ("total wine and more", "Total Wine & More", ["total wine"]),
    ("bevmo", "BevMo!", ["bev mo"]),

    # Fitness / personal care
    ("planet fitness", "Planet Fitness", []),
    ("la fitness", "LA Fitness", []),
    ("ulta beauty", "Ulta Beauty", ["ulta"]),
    ("sephora", "Sephora", []),
    ("great clips", "Great Clips", []),
    ("supercuts", "Supercuts", ["super cuts"]),
]


def upgrade() -> None:
    canonical_merchants = table(
        'canonical_merchants',
        column('id', postgresql.UUID(as_uuid=True)),
        column('user_email', sa.String),
        column('canonical_name', sa.String),
        column('display_name', sa.String),
        column('is_global', sa.Boolean),
        schema='trackspense',
    )
    entity_aliases = table(
        'entity_aliases',
        column('id', postgresql.UUID(as_uuid=True)),
        column('user_email', sa.String),
        column('entity_type', sa.String),
        column('entity_id', postgresql.UUID(as_uuid=True)),
        column('raw_key', sa.String),
        column('source', sa.String),
        column('confirmed', sa.Boolean),
        schema='trackspense',
    )

    merchant_rows = []
    alias_rows = []
    for canonical_name, display_name, aliases in MERCHANTS:
        entity_id = uuid.uuid4()
        merchant_rows.append({
            'id': entity_id, 'user_email': None, 'canonical_name': canonical_name,
            'display_name': display_name, 'is_global': True,
        })
        for alias_raw_key in aliases:
            alias_rows.append({
                'id': uuid.uuid4(), 'user_email': None, 'entity_type': 'merchant',
                'entity_id': entity_id, 'raw_key': alias_raw_key, 'source': 'seed',
                'confirmed': True,
            })

    op.bulk_insert(canonical_merchants, merchant_rows, multiinsert=False)
    if alias_rows:
        op.bulk_insert(entity_aliases, alias_rows, multiinsert=False)


def downgrade() -> None:
    op.execute(
        "DELETE FROM trackspense.entity_aliases WHERE source = 'seed' AND entity_type = 'merchant'"
    )
    op.execute(
        "DELETE FROM trackspense.canonical_merchants WHERE is_global = TRUE AND user_email IS NULL"
    )
