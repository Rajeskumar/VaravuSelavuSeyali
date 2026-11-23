"""RuleCategorizer: merchant dictionary + keyword rules (no LLM, no DB)."""
import pytest

from varavu_selavu_service.services.categorization_service import CATEGORY_GROUPS
from varavu_selavu_service.services.category_rules import get_rule_categorizer
from varavu_selavu_service.services.category_rules.keyword_rules import ITEM_KEYWORDS, KEYWORD_RULES
from varavu_selavu_service.services.category_rules.merchant_dictionary import MERCHANTS
from varavu_selavu_service.services.category_rules.normalizer import clean_raw, normalize_text


@pytest.fixture(scope="module")
def rules():
    return get_rule_categorizer()


def test_every_rule_targets_a_real_category():
    for table in (MERCHANTS, KEYWORD_RULES, ITEM_KEYWORDS):
        for main, sub in table:
            assert sub in CATEGORY_GROUPS.get(main, []), (main, sub)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("SQ *BLUE BOTTLE #1234", "blue bottle"),
        ("TST* Taj Kitchen", "taj kitchen"),
        ("POS DEBIT STARBUCKS STORE 00123 5.40", "starbucks"),
        ("AMAZON.COM", "amazon com"),
        ("spotify", "spotify"),  # a 2-letter processor prefix must not eat the start of a name
    ],
)
def test_normalizer_strips_processor_noise(raw, expected):
    assert normalize_text(raw) == expected


def test_clean_raw_keeps_short_digit_names():
    assert "7" in clean_raw("7-Eleven")


@pytest.mark.parametrize(
    "description,main,sub,merchant",
    [
        ("Starbucks", "Food & Drink", "Dining out", "Starbucks"),
        ("coffee at starbucks downtown", "Food & Drink", "Dining out", "Starbucks"),
        ("starbuks", "Food & Drink", "Dining out", "Starbucks"),  # fuzzy
        ("SQ *BLUE BOTTLE #1234 SAN FRANCISCO CA", "Food & Drink", "Dining out", "Blue Bottle Coffee"),
        ("AMZN Mktp US*2K3", "Other", "General", "Amazon"),
        ("costco whse #123", "Food & Drink", "Groceries", "Costco Wholesale"),
        ("Costco Gas", "Transportation", "Gas/fuel", "Costco Gas"),
        ("PG&E", "Utilities", "Electricity", "PG&E"),
        ("uber to airport", "Transportation", "Taxi", "Uber"),
        ("verizon wireless", "Utilities", "TV/Phone/Internet", "Verizon"),
        ("netflix subscription", "Entertainment", "Movies", "Netflix"),
        ("subway", "Food & Drink", "Dining out", "Subway"),
    ],
)
def test_merchant_matches(rules, description, main, sub, merchant):
    m = rules.classify(description)
    assert m is not None
    assert (m.main_category, m.subcategory, m.merchant_name, m.source) == (main, sub, merchant, "merchant")


@pytest.mark.parametrize(
    "description,main,sub",
    [
        ("rent for october", "Home", "Rent"),
        ("gas", "Transportation", "Gas/fuel"),
        ("gas bill", "Utilities", "Heat/gas"),  # the phrase beats the single word
        ("car rental", "Transportation", "Car"),  # not Home/Rent
        ("dinner with friends", "Food & Drink", "Dining out"),
        ("electric bill", "Utilities", "Electricity"),
        ("subway ticket", "Transportation", "Bus/Train"),  # not the sandwich chain
        ("cricket bat", "Entertainment", "Sports"),  # not Cricket Wireless
        ("kids daycare", "Life", "Childcare"),
        ("doctor visit copay", "Life", "Medical expenses"),
        ("TST* Taj Indian Kitchen", "Food & Drink", "Dining out"),
    ],
)
def test_keyword_rules(rules, description, main, sub):
    m = rules.classify(description)
    assert m is not None
    assert (m.main_category, m.subcategory, m.source) == (main, sub, "keyword")


@pytest.mark.parametrize("description", ["lemonade stand", "mystery payment", "", None])
def test_common_words_and_unknowns_do_not_match(rules, description):
    assert rules.classify(description) is None


def test_merchant_beats_keywords(rules):
    # "shell" alone is the gas station; the dictionary hit wins over any keyword.
    m = rules.classify("Shell")
    assert (m.subcategory, m.source) == ("Gas/fuel", "merchant")


@pytest.mark.parametrize(
    "item,fallback,expected",
    [
        ("BNLS CHKN BRST", ("Food & Drink", "Groceries"), "Groceries"),
        ("PAPER TOWELS", ("Food & Drink", "Groceries"), "Household supplies"),
        ("HDMI CABLE", ("Food & Drink", "Groceries"), "Electronics"),
        ("KS WINE", ("Food & Drink", "Groceries"), "Liquor"),
        ("TYLENOL", ("Food & Drink", "Groceries"), "Medical expenses"),
        ("SOMETHING ODD", ("Life", "Medical expenses"), "Medical expenses"),
        ("CHICKEN TIKKA", ("Food & Drink", "Dining out"), "Dining out"),  # restaurant items stay meals
    ],
)
def test_item_categories(rules, item, fallback, expected):
    assert rules.classify_item(item, fallback)[1] == expected


@pytest.mark.parametrize(
    "category,description,merchant,expected",
    [
        ("Groceries", "anything", None, "Groceries"),  # a valid pick from the model is kept
        ("General", "coffee at starbucks", None, "Dining out"),
        (None, "electric bill", None, "Electricity"),
        ("Food and Drink", "lunch", None, "Dining out"),  # invalid label -> rules
        ("", "weekly shop", "Trader Joe's", "Groceries"),  # merchant wins over description
        ("General", "zqx vendor", None, "General"),
    ],
)
def test_agent_category_resolution(category, description, merchant, expected):
    from varavu_selavu_service.services.chat_service import _resolve_agent_category

    assert _resolve_agent_category(category, description, merchant) == expected


@pytest.mark.parametrize(
    "description,sub,merchant",
    [
        ("Shell gas", "Gas/fuel", "Shell"),  # everyday-word merchant + agreeing keyword
        ("Subway sandwich", "Dining out", "Subway"),
        ("Target run", "Groceries", "Target"),  # + filler word
        ("lunch at Subway", "Dining out", "Subway"),  # after "at"
    ],
)
def test_exact_only_merchants_match_in_agreeing_context(rules, description, sub, merchant):
    m = rules.classify(description)
    assert (m.subcategory, m.merchant_name, m.source) == (sub, merchant, "merchant")


@pytest.mark.parametrize(
    "description,sub",
    [
        ("subway ticket", "Bus/Train"),  # "ticket" disagrees with the sandwich chain
        ("steam cleaning", "Cleaning"),
        ("cricket bat", "Sports"),
    ],
)
def test_exact_only_merchants_still_rejected_when_context_disagrees(rules, description, sub):
    m = rules.classify(description)
    assert (m.subcategory, m.merchant_name, m.source) == (sub, None, "keyword")


@pytest.mark.parametrize(
    "description,merchant",
    [
        ("Joe's Pizza", "Joe's Pizza"),
        ("lunch at Joe's Pizza", "Joe's Pizza"),
        ("lunch at joe's pizza for the team", "Joe's Pizza"),  # trailing clause dropped, title-cased
        ("Taj Indian Kitchen", "Taj Indian Kitchen"),
        ("TST* Taj Indian Kitchen", "Taj Indian Kitchen"),  # POS prefix stripped
        ("ACE AUTO REPAIR", "Ace Auto Repair"),  # statement caps normalized
        ("oil change at Bob's Garage", "Bob's Garage"),
    ],
)
def test_keyword_matches_name_the_business_from_the_description(rules, description, merchant):
    m = rules.classify(description)
    assert (m.merchant_name, m.source) == (merchant, "keyword")


@pytest.mark.parametrize(
    "description",
    ["dinner with friends", "Dinner With Friends", "coffee at work", "dinner at home",
     "coffee at the office", "Pizza", "groceries", "rent", "parking downtown"],
)
def test_ordinary_phrases_get_no_guessed_merchant(rules, description):
    m = rules.classify(description)
    assert m is not None and m.merchant_name is None
