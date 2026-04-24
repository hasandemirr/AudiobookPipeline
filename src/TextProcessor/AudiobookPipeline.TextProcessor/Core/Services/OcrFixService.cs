using System.Text.Json;
using System.Text.RegularExpressions;

namespace AudiobookPipeline.TextProcessor.Core.Services;

public class OcrRule
{
    public string Type { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
}

public class OcrRuleSet
{
    public List<OcrRule> Rules { get; set; } = new();
}

public class OcrFixService
{
    private readonly List<OcrRule> _rules;

    public OcrFixService(string rulesPath)
    {
        if (!File.Exists(rulesPath))
        {
            _rules = new List<OcrRule>();
            return;
        }
        var json = File.ReadAllText(rulesPath);
        var ruleSet = JsonSerializer.Deserialize<OcrRuleSet>(
            json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
        _rules = ruleSet?.Rules ?? new List<OcrRule>();
    }

    public string Apply(string text)
    {
        foreach (var rule in _rules)
        {
            text = rule.Type switch
            {
                "word_replace" => text.Replace(
                    rule.From, rule.To,
                    StringComparison.OrdinalIgnoreCase),
                "char_replace" => text.Replace(rule.From, rule.To),
                "regex" => Regex.Replace(text, rule.From, rule.To),
                _ => text
            };
        }
        return text;
    }

    public int RuleCount => _rules.Count;
}
