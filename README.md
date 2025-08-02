# Malterlib Syntax Coloring README

## Features

* Syntaxt highlighting for Malterlib C++ and build files
* Try to mimic the Malterlib coloring semantics for other file types

---

## Configuration

### Manual Configuration

If you are not using the Malterlib theme you can use your theme of choice and enable instead configure the highlighting colors in your settings.json.

---
Here are the recommmended colors:

<details><summary>Recommended Settings</summary>
    
```json
  "workbench.highlightingColorSpace": "display-p3",
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": [
          "malterlib.preprocessor.directive",
          "malterlib.keyword",
          "malterlib.keyword.casts",
          "malterlib.keyword.clr",
          "malterlib.keyword.control.statement",
          "malterlib.keyword.exception.handling",
          "malterlib.keyword.function",
          "malterlib.keyword.in",
          "malterlib.keyword.introspection",
          "malterlib.keyword.namespace",
          "malterlib.keyword.new.delete",
          "malterlib.keyword.operator",
          "malterlib.keyword.optimization",
          "malterlib.keyword.other",
          "malterlib.keyword.pure",
          "malterlib.keyword.static.assert",
          "malterlib.keyword.storage.class",
          "malterlib.keyword.template",
          "malterlib.keyword.this",
          "malterlib.keyword.type.specification",
          "malterlib.keyword.typedef",
          "malterlib.keyword.using",
          "malterlib.keyword.virtual",
          "punctuation.definition.dictionary.begin.json.comments",
          "punctuation.separator.dictionary.pair",
          "punctuation.definition.array.end",
          "punctuation.definition.template-expression.begin",
          "punctuation.definition.template-expression.end",
          "storage.type",
          "keyword",
          "keyword.other",
          "keyword.operator",
          "keyword.operator.new",
          "keyword.operator.comparison",
          "keyword.operator.comparison.cpp",
          "keyword.operator.assignment.c",
          "keyword.operator.c",
          "keyword.operator.assignment.compound",
          "keyword.operator.logical",
          "keyword.operator.logical.python",
          "keyword.control",
          "entity.other.attribute-name",
          "constant.language.import-export-all.ts",
          "variable.language",
          "punctuation.definition.block",
          "punctuation.definition.parameters",
          "punctuation.definition.subshell",
          "punctuation.separator.method",
          "punctuation.definition.arguments",
          "storage.modifier.reference",
          "punctuation.definition.entity",
          "punctuation.separator.list.comma.css",
          "punctuation.section.function.begin.bracket",
          "punctuation.section.function.end.bracket",
          "meta.brace.round.directive",
          "punctuation.colon",
          "storage.modifier.groovy",
          "punctuation.bracket",
          "punctuation.separator",
          "text.pug constant.name.attribute.tag",
          "text.pug attribute_value",
          "text.pug constant",
          "storage.type.import.include.pug",
          "meta.brace",
          "text.pug source.coffeescript.filter.pug",
          "punctuation.terminator",
          "punctuation.section",
          "storage.type.function",
          "storage.type.js",
          "storage.type.ts",
          "storage.type.type.ts",
          "punctuation.definition.prolog",
          "meta.prolog",
          "meta.line.ruby",
          "meta.template.expression",
          "variable.other.macro.argument",
          "entity.name.function.definition.special.member.destructor"
        ],
        "settings": {
          "foreground": "#ffffff"
        }
      },
      {
        "scope": [
          "malterlib.keyword.propertymodifier",
          "malterlib.keyword.typename",
          "malterlib.keyword.property.modifiers",
          "keyword.operator.redirect",
          "storage.modifier",
          "storage.modifier.local",
          "punctuation.definition.tag",
          "entity.name.type.annotation"
        ],
        "settings": {
          "foreground": "#c0c0c0"
        }
      },
      {
        "scope": [
          "malterlib.keyword.propertymodifier.brackets",
          "malterlib.keyword.property.modifiers.brackets"
        ],
        "settings": {
          "foreground": "#909090"
        }
      },
      {
        "scope": [
          "punctuation.separator.continuation.c",
          "malterlib.preprocessor.escape",
          "constant.character.escape.line-continuation"
        ],
        "settings": {
          "foreground": "#808080"
        }
      },
      {
        "scope": [
          "malterlib.keyword.access",
          "storage.modifier.ts",
          "storage.modifier.access-control"
        ],
        "settings": {
          "foreground": "#ffc8ca"
        }
      },
      {
        "scope": [
          "malterlib.keyword.builtintype",
          "malterlib.keyword.builtincharactertype",
          "malterlib.keyword.builtinintegertype",
          "malterlib.keyword.builtintypemodifier",
          "malterlib.keyword.builtinvectortype",
          "malterlib.keyword.builtinfloattyp",
          "malterlib.keyword.builtin.character.types",
          "malterlib.keyword.builtin.float.types",
          "malterlib.keyword.builtin.integer.types",
          "malterlib.keyword.builtin.type.modifiers",
          "malterlib.keyword.builtin.types",
          "malterlib.keyword.builtin.vector.types",
          "support.type.primitive",
          "support.type.primitive.ts",
          "storage.type.built-in.primitive",
          "storage.type.primitive"
        ],
        "settings": {
          "foreground": "#ff5966"
        }
      },
      {
        "scope": [
          "constant.numeric",
          "keyword.other.unit",
          "keyword.operator.redirect.stderr.shell"
        ],
        "settings": {
          "foreground": "#ff0080"
        }
      },
      {
        "scope": [
          "malterlib.constant.template",
          "malterlib.template.non.type.param",
          "malterlib.template.non.type.param.pack"
        ],
        "settings": {
          "foreground": "#ff5bad"
        }
      },
      {
        "scope": [
          "malterlib.constant",
          "malterlib.constant.variable",
          "malterlib.keyword.js.bultinconstant",
          "malterlib.keyword.builtinconstant",
          "malterlib.constant.enumerator",
          "malterlib.enumerator",
          "malterlib.global.constant",
          "malterlib.member.constant.public",
          "malterlib.keyword.builtin.constants",
          "variable.other.enummember",
          "constant.language",
          "constant.other",
          "variable.other.constant",
          "support.constant.color",
          "constant.codepoint-range",
          "punctuation.section.range.less",
          "support.constant.unicode-range"
        ],
        "settings": {
          "foreground": "#ff8ac5"
        }
      },
      {
        "scope": [
          "malterlib.constant.private",
          "malterlib.member.constant.private"
        ],
        "settings": {
          "foreground": "#ca97b1"
        }
      },
      {
        "scope": [
          "malterlib.constant.templatefunction",
          "malterlib.function.template.non.type.param",
          "malterlib.function.template.non.type.param.pack"
        ],
        "settings": {
          "foreground": "#ffb7db"
        }
      },
      {
        "scope": [
          "source.cpp string.quoted.single",
          "source.cpp string.quoted.single punctuation.definition.string.begin",
          "source.cpp string.quoted.single punctuation.definition.string.end",
          "source.c string.quoted.single",
          "source.c string.quoted.single punctuation.definition.string.begin",
          "source.c string.quoted.single punctuation.definition.string.end"
        ],
        "settings": {
          "foreground": "#ff48f0"
        }
      },
      {
        "scope": [
          "malterlib.namespace",
          "malterlib.namespace.explicit",
          "entity.name.namespace",
          "punctuation.separator.namespace.ruby",
          "entity.name.scope-resolution",
          "entity.name.type.package",
          "entity.name.type.class.module",
          "entity.name.package"
        ],
        "settings": {
          "foreground": "#d785ff"
        }
      },
      {
        "scope": [
          "malterlib.templatetypeparam",
          "malterlib.template.type.param.class",
          "malterlib.template.type.param.class.pack",
          "malterlib.template.template.param",
          "malterlib.template.template.param.pack",
          "malterlib.template.type.param.function",
          "malterlib.template.type.param.function.pack",
          "entity.other.attribute-name.pseudo-class",
          "variable.fragment",
          "entity.name.fragment",
          "storage.type.generic.java"
        ],
        "settings": {
          "foreground": "#8269ff"
        }
      },
      {
        "scope": [
          "malterlib.functiontemplatetypeparam",
          "malterlib.function.template.template.param",
          "malterlib.function.template.template.param.pack",
          "malterlib.function.template.type.param.class",
          "malterlib.function.template.type.param.class.pack",
          "malterlib.function.template.type.param.function",
          "malterlib.function.template.type.param.function.pack"
        ],
        "settings": {
          "foreground": "#cdc3ff"
        }
      },
      {
        "scope": [
          "malterlib.template.type",
          "malterlib.template.type.interface",
          "malterlib.enum",
          "malterlib.type",
          "malterlib.type.explicit",
          "malterlib.type.function",
          "malterlib.type.interface",
          "support.class",
          "entity.name.type",
          "entity.name.type.class",
          "entity.other.inherited-class",
          "entity.other.attribute-name.class",
          "support.type",
          "storage.type.groovy",
          "entity.name.section.group-title.ini",
          "storage.type.haskell",
          "storage.type.java"
        ],
        "settings": {
          "foreground": "#b8aaff"
        }
      },
      {
        "scope": [
          "malterlib.keyword.auto"
        ],
        "settings": {
          "foreground": "#dbd3ff"
        }
      },
      {
        "scope": [
          "string.quoted.single",
          "string.quoted.single punctuation.definition.string.begin",
          "string.quoted.single punctuation.definition.string.end",
          "string",
          "string.quoted punctuation.definition.string.begin",
          "string.quoted punctuation.definition.string.end",
          "string.quoted",
          "string.regexp punctuation.definition.string.begin",
          "string.regexp punctuation.definition.string.end",
          "string.regexp",
          "variable.parameter.url.css",
          "meta.property-value.css",
          "support.constant.language-range.css",
          "text.html.derivative",
          "source.ini",
          "text.pug",
          "source.batchfile",
          "text.haml",
          "text.tex.latex"
        ],
        "settings": {
          "foreground": "#009eff"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter.pack.functor",
          "malterlib.functor.param",
          "malterlib.function.parameter.functor"
        ],
        "settings": {
          "foreground": "#00e4e6"
        }
      },
      {
        "scope": [
          "malterlib.functor.param.output",
          "malterlib.function.parameter.output.functor",
          "malterlib.function.parameter.output.pack.functor"
        ],
        "settings": {
          "foreground": "#36e8cd"
        }
      },
      {
        "scope": [
          "malterlib.functor.local",
          "malterlib.variable.functor"
        ],
        "settings": {
          "foreground": "#00edae"
        }
      },
      {
        "scope": [
          "malterlib.functor.member",
          "malterlib.member.variable.public.functor"
        ],
        "settings": {
          "foreground": "#00f265"
        }
      },
      {
        "scope": [
          "malterlib.functor.member.private",
          "malterlib.member.variable.private.functor"
        ],
        "settings": {
          "foreground": "#4fc17e"
        }
      },
      {
        "scope": [
          "malterlib.member.function.public",
          "malterlib.member.function.public.explicit",
          "malterlib.member.function.public.recursive",
          "malterlib.member.static.function.public",
          "malterlib.member.static.function.public.recursive",
          "entity.name.function",
          "meta.method-call"
        ],
        "settings": {
          "foreground": "#26ff00"
        }
      },
      {
        "scope": [
          "malterlib.function.recursive",
          "malterlib.function",
          "malterlib.function.explicit",
          "malterlib.static.function",
          "malterlib.static.function.recursive",
          "variable.legacy.builtin.python",
          "keyword.command",
          "support.function"
        ],
        "settings": {
          "foreground": "#1cb900"
        }
      },
      {
        "scope": [
          "malterlib.member.function.private",
          "malterlib.member.function.private.recursive",
          "malterlib.member.static.function.private",
          "malterlib.member.static.function.private.recursive"
        ],
        "settings": {
          "foreground": "#8dd580"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter.pack",
          "malterlib.function.parameter",
          "variable.parameter",
          "meta.arguments",
          "keyword.other.back-reference.regexp",
          "entity.other.attribute-name"
        ],
        "settings": {
          "fontStyle": "",
          "foreground": "#e6ff00"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter.output",
          "malterlib.function.parameter.output.pack"
        ],
        "settings": {
          "foreground": "#fff54b"
        }
      },
      {
        "scope": [
          "malterlib.variable",
          "variable.other.readwrite.alias",
          "variable.other.readwrite",
          "variable.other.object.ts",
          "variable.other.constant.ts",
          "variable.assignment",
          "variable.other.object",
          "variable.other.regexp",
          "variable.other",
          "variable.graphql",
          "meta.definition.variable",
          "entity.other.attribute-name.id.css",
          "variable.other.constant.object.js",
          "variable.other.constant.object.ts"
        ],
        "settings": {
          "foreground": "#ffd700"
        }
      },
      {
        "scope": [
          "malterlib.keyword.qualifiers",
          "malterlib.keyword.qualifier",
          "malterlib.concept"
        ],
        "settings": {
          "foreground": "#ffb680"
        }
      },
      {
        "scope": [
          "malterlib.member",
          "malterlib.member.variable.public",
          "malterlib.entity.explicit",
          "variable.object.property",
          "variable.other.object.property",
          "meta.object.member",
          "meta.object-literal.key",
          "support.type.property-name.json",
          "variable.other.property",
          "variable.other.constant.property",
          "support.type.property-name",
          "constant.other.key",
          "keyword.other.definition.ini",
          "support.type.property-name.json punctuation.definition.string.begin",
          "support.type.property-name.json punctuation.definition.string.end"
        ],
        "settings": {
          "foreground": "#ffa600"
        }
      },
      {
        "scope": [
          "malterlib.member.private",
          "malterlib.member.variable.private"
        ],
        "settings": {
          "foreground": "#c59d53"
        }
      },
      {
        "scope": [
          "malterlib.macro",
          "malterlib.macro.explicit"
        ],
        "settings": {
          "foreground": "#ff7700"
        }
      },
      {
        "scope": [
          "malterlib.macro.parameter"
        ],
        "settings": {
          "foreground": "#ffbc81"
        }
      },
      {
        "scope": [
          "malterlib.member.static",
          "malterlib.member.static.variable.public",
          "malterlib.member.static.variable.public.functor",
          "entity.other.attribute-name.pseudo-element.css",
          "invalid.deprecated.entity.other.attribute-name"
        ],
        "settings": {
          "foreground": "#ff3f1c"
        }
      },
      {
        "scope": [
          "malterlib.global",
          "malterlib.global.static.variable",
          "malterlib.global.static.variable.functor",
          "malterlib.global.variable",
          "malterlib.global.variable.functor",
          "malterlib.static.variable",
          "malterlib.static.variable.functor"
        ],
        "settings": {
          "foreground": "#e13819"
        }
      },
      {
        "scope": [
          "malterlib.member.static.private",
          "malterlib.member.static.variable.private",
          "malterlib.member.static.variable.private.functor",
          "malterlib.tuple.explicit",
          "entity.name.tag"
        ],
        "settings": {
          "foreground": "#d56955"
        }
      },
      {
        "scope": [
          "comment",
          "punctuation.definition.comment",
          "comment.line.double-slash",
          "punctuation.definition.quote.begin.markdown",
          "string.comment"
        ],
        "settings": {
          "fontStyle": "",
          "foreground": "#898989"
        }
      },
      {
        "scope": [
          "emphasis",
          "markup.italic"
        ],
        "settings": {
          "fontStyle": "italic"
        }
      },
      {
        "scope": [
          "strong",
          "markup.bold",
          "markup.heading"
        ],
        "settings": {
          "fontStyle": "bold"
        }
      },
      {
        "scope": [
          "markup.underline"
        ],
        "settings": {
          "fontStyle": "underline"
        }
      },
      {
        "scope": [
          "markup.underline"
        ],
        "settings": {
          "fontStyle": "underline"
        }
      },
      {
        "scope": [
          "markup.strikethrough"
        ],
        "settings": {
          "fontStyle": "strikethrough"
        }
      },
      {
        "scope": [
          "markup.strikethrough markup.bold",
          "markup.bold markup.strikethrough"
        ],
        "settings": {
          "fontStyle": "bold strikethrough"
        }
      },
      {
        "scope": [
          "markup.strikethrough markup.italic",
          "markup.italic markup.strikethrough"
        ],
        "settings": {
          "fontStyle": "italic strikethrough"
        }
      },
      {
        "scope": [
          "markup.italic markup.bold",
          "markup.bold markup.italic"
        ],
        "settings": {
          "fontStyle": "bold italic"
        }
      },
      {
        "scope": [
          "markup.italic markup.bold markup.strikethrough",
          "markup.bold markup.italic markup.strikethrough",
          "markup.italic markup.strikethrough markup.bold",
          "markup.bold markup.strikethrough markup.italic",
          "markup.strikethrough markup.italic markup.bold",
          "markup.strikethrough markup.bold markup.italic"
        ],
        "settings": {
          "fontStyle": "bold italic strikethrough"
        }
      },
      {
        "scope": [
          "constant.character.escape",
          "constant.character.numeric.regexp",
          "text.html.derivative punctuation.definition.entity",
          "text.html.derivative constant.character.entity"
        ],
        "settings": {
          "foreground": "#81cefe"
        }
      },
      {
        "scope": [
          "constant.other.character-class.regexp",
          "constant.other.character-class.range.regexp",
          "punctuation.definition.character-class.regexp",
          "constant.other.character-class.set.regexp"
        ],
        "settings": {
          "foreground": "#a281fe"
        }
      },
      {
        "scope": [
          "keyword.control.anchor.regexp",
          "punctuation.definition.group.regexp",
          "keyword.operator.negation.regexp",
          "keyword.operator.or.regexp"
        ],
        "settings": {
          "foreground": "#cdcdcd"
        }
      },
      {
        "scope": [
          "keyword.operator.quantifier.regexp"
        ],
        "settings": {
          "foreground": "#e96e39"
        }
      },
      {
        "scope": [
          "constant.character.escape"
        ],
        "settings": {
          "foreground": "#81cefe"
        }
      },
      {
        "scope": [
          "source.cpp string.quoted.single constant.character.escape",
          "source.c string.quoted.single constant.character.escape"
        ],
        "settings": {
          "foreground": "#fb80f1"
        }
      }
    ]
  }
```
</details>

If you have a Visual Studio Code that doesn't support changing color space (or if you prefer sRGB):
<details><summary>Recommended Settings (sRGB)</summary>

```json
  "workbench.highlightingColorSpace": "srgb",
  "editor.tokenColorCustomizations": {
    "textMateRules": [
      {
        "scope": [
          "malterlib.preprocessor.directive",
          "malterlib.keyword",
          "malterlib.keyword.casts",
          "malterlib.keyword.clr",
          "malterlib.keyword.control.statement",
          "malterlib.keyword.exception.handling",
          "malterlib.keyword.function",
          "malterlib.keyword.in",
          "malterlib.keyword.introspection",
          "malterlib.keyword.namespace",
          "malterlib.keyword.new.delete",
          "malterlib.keyword.operator",
          "malterlib.keyword.optimization",
          "malterlib.keyword.other",
          "malterlib.keyword.pure",
          "malterlib.keyword.static.assert",
          "malterlib.keyword.storage.class",
          "malterlib.keyword.template",
          "malterlib.keyword.this",
          "malterlib.keyword.type.specification",
          "malterlib.keyword.typedef",
          "malterlib.keyword.using",
          "malterlib.keyword.virtual",
          "punctuation.definition.dictionary.begin.json.comments",
          "punctuation.separator.dictionary.pair",
          "punctuation.definition.array.end",
          "punctuation.definition.template-expression.begin",
          "punctuation.definition.template-expression.end",
          "storage.type",
          "keyword",
          "keyword.other",
          "keyword.operator",
          "keyword.operator.new",
          "keyword.operator.comparison",
          "keyword.operator.comparison.cpp",
          "keyword.operator.assignment.c",
          "keyword.operator.c",
          "keyword.operator.assignment.compound",
          "keyword.operator.logical",
          "keyword.operator.logical.python",
          "keyword.control",
          "entity.other.attribute-name",
          "constant.language.import-export-all.ts",
          "variable.language",
          "punctuation.definition.block",
          "punctuation.definition.parameters",
          "punctuation.definition.subshell",
          "punctuation.separator.method",
          "punctuation.definition.arguments",
          "storage.modifier.reference",
          "punctuation.definition.entity",
          "punctuation.separator.list.comma.css",
          "punctuation.section.function.begin.bracket",
          "punctuation.section.function.end.bracket",
          "meta.brace.round.directive",
          "punctuation.colon",
          "storage.modifier.groovy",
          "punctuation.bracket",
          "punctuation.separator",
          "text.pug constant.name.attribute.tag",
          "text.pug attribute_value",
          "text.pug constant",
          "storage.type.import.include.pug",
          "meta.brace",
          "text.pug source.coffeescript.filter.pug",
          "punctuation.terminator",
          "punctuation.section",
          "storage.type.function",
          "storage.type.js",
          "storage.type.ts",
          "storage.type.type.ts",
          "punctuation.definition.prolog",
          "meta.prolog",
          "meta.line.ruby",
          "meta.template.expression",
          "variable.other.macro.argument",
          "entity.name.function.definition.special.member.destructor"
        ],
        "settings": {
          "foreground": "#ffffff"
        }
      },
      {
        "scope": [
          "malterlib.keyword.propertymodifier",
          "malterlib.keyword.typename",
          "malterlib.keyword.property.modifiers",
          "keyword.operator.redirect",
          "storage.modifier",
          "storage.modifier.local",
          "punctuation.definition.tag",
          "entity.name.type.annotation"
        ],
        "settings": {
          "foreground": "#c0c0c0"
        }
      },
      {
        "scope": [
          "malterlib.keyword.propertymodifier.brackets",
          "malterlib.keyword.property.modifiers.brackets"
        ],
        "settings": {
          "foreground": "#909090"
        }
      },
      {
        "scope": [
          "punctuation.separator.continuation.c",
          "malterlib.preprocessor.escape",
          "constant.character.escape.line-continuation"
        ],
        "settings": {
          "foreground": "#808080"
        }
      },
      {
        "scope": [
          "malterlib.keyword.access",
          "storage.modifier.ts",
          "storage.modifier.access-control"
        ],
        "settings": {
          "foreground": "#ffc5c9"
        }
      },
      {
        "scope": [
          "malterlib.keyword.builtintype",
          "malterlib.keyword.builtincharactertype",
          "malterlib.keyword.builtinintegertype",
          "malterlib.keyword.builtintypemodifier",
          "malterlib.keyword.builtinvectortype",
          "malterlib.keyword.builtinfloattyp",
          "malterlib.keyword.builtin.character.types",
          "malterlib.keyword.builtin.float.types",
          "malterlib.keyword.builtin.integer.types",
          "malterlib.keyword.builtin.type.modifiers",
          "malterlib.keyword.builtin.types",
          "malterlib.keyword.builtin.vector.types",
          "support.type.primitive",
          "support.type.primitive.ts",
          "storage.type.built-in.primitive",
          "storage.type.primitive"
        ],
        "settings": {
          "foreground": "#ff4661"
        }
      },
      {
        "scope": [
          "constant.numeric",
          "keyword.other.unit",
          "keyword.operator.redirect.stderr.shell"
        ],
        "settings": {
          "foreground": "#ff0080"
        }
      },
      {
        "scope": [
          "malterlib.constant.template",
          "malterlib.template.non.type.param",
          "malterlib.template.non.type.param.pack"
        ],
        "settings": {
          "foreground": "#ff49af"
        }
      },
      {
        "scope": [
          "malterlib.constant",
          "malterlib.constant.variable",
          "malterlib.keyword.js.bultinconstant",
          "malterlib.keyword.builtinconstant",
          "malterlib.constant.enumerator",
          "malterlib.enumerator",
          "malterlib.global.constant",
          "malterlib.member.constant.public",
          "malterlib.keyword.builtin.constants",
          "variable.other.enummember",
          "constant.language",
          "constant.other",
          "variable.other.constant",
          "support.constant.color",
          "constant.codepoint-range",
          "punctuation.section.range.less",
          "support.constant.unicode-range"
        ],
        "settings": {
          "foreground": "#ff82c7"
        }
      },
      {
        "scope": [
          "malterlib.constant.private",
          "malterlib.member.constant.private"
        ],
        "settings": {
          "foreground": "#d394b2"
        }
      },
      {
        "scope": [
          "malterlib.constant.templatefunction",
          "malterlib.function.template.non.type.param",
          "malterlib.function.template.non.type.param.pack"
        ],
        "settings": {
          "foreground": "#ffb3dd"
        }
      },
      {
        "scope": [
          "source.cpp string.quoted.single",
          "source.cpp string.quoted.single punctuation.definition.string.begin",
          "source.cpp string.quoted.single punctuation.definition.string.end",
          "source.c string.quoted.single",
          "source.c string.quoted.single punctuation.definition.string.begin",
          "source.c string.quoted.single punctuation.definition.string.end"
        ],
        "settings": {
          "foreground": "#ff2cf7"
        }
      },
      {
        "scope": [
          "malterlib.namespace",
          "malterlib.namespace.explicit",
          "entity.name.namespace",
          "punctuation.separator.namespace.ruby",
          "entity.name.scope-resolution",
          "entity.name.type.package",
          "entity.name.type.class.module",
          "entity.name.package"
        ],
        "settings": {
          "foreground": "#e480ff"
        }
      },
      {
        "scope": [
          "malterlib.templatetypeparam",
          "malterlib.template.type.param.class",
          "malterlib.template.type.param.class.pack",
          "malterlib.template.template.param",
          "malterlib.template.template.param.pack",
          "malterlib.template.type.param.function",
          "malterlib.template.type.param.function.pack",
          "entity.other.attribute-name.pseudo-class",
          "variable.fragment",
          "entity.name.fragment",
          "storage.type.generic.java"
        ],
        "settings": {
          "foreground": "#8768ff"
        }
      },
      {
        "scope": [
          "malterlib.functiontemplatetypeparam",
          "malterlib.function.template.template.param",
          "malterlib.function.template.template.param.pack",
          "malterlib.function.template.type.param.class",
          "malterlib.function.template.type.param.class.pack",
          "malterlib.function.template.type.param.function",
          "malterlib.function.template.type.param.function.pack"
        ],
        "settings": {
          "foreground": "#cfc3ff"
        }
      },
      {
        "scope": [
          "malterlib.template.type",
          "malterlib.template.type.interface",
          "malterlib.enum",
          "malterlib.type",
          "malterlib.type.explicit",
          "malterlib.type.function",
          "malterlib.type.interface",
          "support.class",
          "entity.name.type",
          "entity.name.type.class",
          "entity.other.inherited-class",
          "entity.other.attribute-name.class",
          "support.type",
          "storage.type.groovy",
          "entity.name.section.group-title.ini",
          "storage.type.haskell",
          "storage.type.java"
        ],
        "settings": {
          "foreground": "#bba9ff"
        }
      },
      {
        "scope": [
          "malterlib.keyword.auto"
        ],
        "settings": {
          "foreground": "#ddd3ff"
        }
      },
      {
        "scope": [
          "string.quoted.single",
          "string.quoted.single punctuation.definition.string.begin",
          "string.quoted.single punctuation.definition.string.end",
          "string",
          "string.quoted punctuation.definition.string.begin",
          "string.quoted punctuation.definition.string.end",
          "string.quoted",
          "string.regexp punctuation.definition.string.begin",
          "string.regexp punctuation.definition.string.end",
          "string.regexp",
          "variable.parameter.url.css",
          "meta.property-value.css",
          "support.constant.language-range.css",
          "text.html.derivative",
          "source.ini",
          "text.pug",
          "source.batchfile",
          "text.haml",
          "text.tex.latex"
        ],
        "settings": {
          "foreground": "#00a1ff"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter.pack.functor",
          "malterlib.functor.param",
          "malterlib.function.parameter.functor"
        ],
        "settings": {
          "foreground": "#00e8e8"
        }
      },
      {
        "scope": [
          "malterlib.functor.param.output",
          "malterlib.function.parameter.output.functor",
          "malterlib.function.parameter.output.pack.functor"
        ],
        "settings": {
          "foreground": "#00eccc"
        }
      },
      {
        "scope": [
          "malterlib.functor.local",
          "malterlib.variable.functor"
        ],
        "settings": {
          "foreground": "#00f1a9"
        }
      },
      {
        "scope": [
          "malterlib.functor.member",
          "malterlib.member.variable.public.functor"
        ],
        "settings": {
          "foreground": "#00f64c"
        }
      },
      {
        "scope": [
          "malterlib.functor.member.private",
          "malterlib.member.variable.private.functor"
        ],
        "settings": {
          "foreground": "#00c477"
        }
      },
      {
        "scope": [
          "malterlib.member.function.public",
          "malterlib.member.function.public.explicit",
          "malterlib.member.function.public.recursive",
          "malterlib.member.static.function.public",
          "malterlib.member.static.function.public.recursive",
          "entity.name.function",
          "meta.method-call"
        ],
        "settings": {
          "foreground": "#00ff00"
        }
      },
      {
        "scope": [
          "malterlib.function.recursive",
          "malterlib.function",
          "malterlib.function.explicit",
          "malterlib.static.function",
          "malterlib.static.function.recursive",
          "variable.legacy.builtin.python",
          "keyword.command",
          "support.function"
        ],
        "settings": {
          "foreground": "#00bc00"
        }
      },
      {
        "scope": [
          "malterlib.member.function.private",
          "malterlib.member.function.private.recursive",
          "malterlib.member.static.function.private",
          "malterlib.member.static.function.private.recursive"
        ],
        "settings": {
          "foreground": "#75d775"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter.pack",
          "malterlib.function.parameter",
          "variable.parameter",
          "meta.arguments",
          "keyword.other.back-reference.regexp",
          "entity.other.attribute-name"
        ],
        "settings": {
          "fontStyle": "",
          "foreground": "#e0ff00"
        }
      },
      {
        "scope": [
          "malterlib.function.parameter.output",
          "malterlib.function.parameter.output.pack"
        ],
        "settings": {
          "foreground": "#fff500"
        }
      },
      {
        "scope": [
          "malterlib.variable",
          "variable.other.readwrite.alias",
          "variable.other.readwrite",
          "variable.other.object.ts",
          "variable.other.constant.ts",
          "variable.assignment",
          "variable.other.object",
          "variable.other.regexp",
          "variable.other",
          "variable.graphql",
          "meta.definition.variable",
          "entity.other.attribute-name.id.css",
          "variable.other.constant.object.js",
          "variable.other.constant.object.ts"
        ],
        "settings": {
          "foreground": "#ffd500"
        }
      },
      {
        "scope": [
          "malterlib.keyword.qualifiers",
          "malterlib.keyword.qualifier",
          "malterlib.concept"
        ],
        "settings": {
          "foreground": "#ffb276"
        }
      },
      {
        "scope": [
          "malterlib.member",
          "malterlib.member.variable.public",
          "malterlib.entity.explicit",
          "variable.object.property",
          "variable.other.object.property",
          "meta.object.member",
          "meta.object-literal.key",
          "support.type.property-name.json",
          "variable.other.property",
          "variable.other.constant.property",
          "support.type.property-name",
          "constant.other.key",
          "keyword.other.definition.ini",
          "support.type.property-name.json punctuation.definition.string.begin",
          "support.type.property-name.json punctuation.definition.string.end"
        ],
        "settings": {
          "foreground": "#ffa100"
        }
      },
      {
        "scope": [
          "malterlib.member.private",
          "malterlib.member.variable.private"
        ],
        "settings": {
          "foreground": "#cd9b44"
        }
      },
      {
        "scope": [
          "malterlib.macro",
          "malterlib.macro.explicit"
        ],
        "settings": {
          "foreground": "#ff6c00"
        }
      },
      {
        "scope": [
          "malterlib.macro.parameter"
        ],
        "settings": {
          "foreground": "#ffb876"
        }
      },
      {
        "scope": [
          "malterlib.member.static",
          "malterlib.member.static.variable.public",
          "malterlib.member.static.variable.public.functor",
          "entity.other.attribute-name.pseudo-element.css",
          "invalid.deprecated.entity.other.attribute-name"
        ],
        "settings": {
          "foreground": "#ff1900"
        }
      },
      {
        "scope": [
          "malterlib.global",
          "malterlib.global.static.variable",
          "malterlib.global.static.variable.functor",
          "malterlib.global.variable",
          "malterlib.global.variable.functor",
          "malterlib.static.variable",
          "malterlib.static.variable.functor"
        ],
        "settings": {
          "foreground": "#f51900"
        }
      },
      {
        "scope": [
          "malterlib.member.static.private",
          "malterlib.member.static.variable.private",
          "malterlib.member.static.variable.private.functor",
          "malterlib.tuple.explicit",
          "entity.name.tag"
        ],
        "settings": {
          "foreground": "#e5614e"
        }
      },
      {
        "scope": [
          "comment",
          "punctuation.definition.comment",
          "comment.line.double-slash",
          "punctuation.definition.quote.begin.markdown",
          "string.comment"
        ],
        "settings": {
          "fontStyle": "",
          "foreground": "#898989"
        }
      },
      {
        "scope": [
          "emphasis",
          "markup.italic"
        ],
        "settings": {
          "fontStyle": "italic"
        }
      },
      {
        "scope": [
          "strong",
          "markup.bold",
          "markup.heading"
        ],
        "settings": {
          "fontStyle": "bold"
        }
      },
      {
        "scope": [
          "markup.underline"
        ],
        "settings": {
          "fontStyle": "underline"
        }
      },
      {
        "scope": [
          "markup.underline"
        ],
        "settings": {
          "fontStyle": "underline"
        }
      },
      {
        "scope": [
          "markup.strikethrough"
        ],
        "settings": {
          "fontStyle": "strikethrough"
        }
      },
      {
        "scope": [
          "markup.strikethrough markup.bold",
          "markup.bold markup.strikethrough"
        ],
        "settings": {
          "fontStyle": "bold strikethrough"
        }
      },
      {
        "scope": [
          "markup.strikethrough markup.italic",
          "markup.italic markup.strikethrough"
        ],
        "settings": {
          "fontStyle": "italic strikethrough"
        }
      },
      {
        "scope": [
          "markup.italic markup.bold",
          "markup.bold markup.italic"
        ],
        "settings": {
          "fontStyle": "bold italic"
        }
      },
      {
        "scope": [
          "markup.italic markup.bold markup.strikethrough",
          "markup.bold markup.italic markup.strikethrough",
          "markup.italic markup.strikethrough markup.bold",
          "markup.bold markup.strikethrough markup.italic",
          "markup.strikethrough markup.italic markup.bold",
          "markup.strikethrough markup.bold markup.italic"
        ],
        "settings": {
          "fontStyle": "bold italic strikethrough"
        }
      },
      {
        "scope": [
          "constant.character.escape",
          "constant.character.numeric.regexp",
          "text.html.derivative punctuation.definition.entity",
          "text.html.derivative constant.character.entity"
        ],
        "settings": {
          "foreground": "#65d0ff"
        }
      },
      {
        "scope": [
          "constant.other.character-class.regexp",
          "constant.other.character-class.range.regexp",
          "punctuation.definition.character-class.regexp",
          "constant.other.character-class.set.regexp"
        ],
        "settings": {
          "foreground": "#a87fff"
        }
      },
      {
        "scope": [
          "keyword.control.anchor.regexp",
          "punctuation.definition.group.regexp",
          "keyword.operator.negation.regexp",
          "keyword.operator.or.regexp"
        ],
        "settings": {
          "foreground": "#cdcdcd"
        }
      },
      {
        "scope": [
          "keyword.operator.quantifier.regexp"
        ],
        "settings": {
          "foreground": "#fb6423"
        }
      },
      {
        "scope": [
          "constant.character.escape"
        ],
        "settings": {
          "foreground": "#65d0ff"
        }
      },
      {
        "scope": [
          "source.cpp string.quoted.single constant.character.escape",
          "source.c string.quoted.single constant.character.escape"
        ],
        "settings": {
          "foreground": "#ff77f7"
        }
      }
    ]
  }
```
</details>

---

### Configuration of clangd

When using clangd shipped with Malterlib you can use the following .clangd configuration fragment to enable 
syntax coloring of Malterlib identifiers:
<details><summary>Recommended .clangd</summary>
    
```yaml
SemanticTokens:
  Rules:
    Type|Primitive|Typedef:
      - regex: '^(double|float|fp1024|fp128|fp16|fp2048|fp256|fp32|fp4096|fp512|fp64|fp8|fp80|ufp1024|ufp128|ufp16|ufp2048|ufp256|ufp32|ufp4096|ufp512|ufp64|ufp8|ufp80|zfp1024|zfp128|zfp16|zfp2048|zfp256|zfp32|zfp4096|zfp512|zfp64|zfp8|zfp80|zufp1024|zufp128|zufp16|zufp2048|zufp256|zufp32|zufp4096|zufp512|zufp64|zufp8|zufp80)$'
        add: [Custom0, Custom1]  # malterlib.keyword.builtin.float.types
      - regex: '^(__int16|__int32|__int64|__int8|aint|int|int1024|int128|int16|int160|int2048|int256|int32|int4096|int512|int64|int8|int80|int8192|mint|size_t|smint|uaint|uint1024|uint128|uint16|uint160|uint2048|uint256|uint32|uint4096|uint512|uint64|uint8|uint80|uint8192|umint|zamint|zint1024|zint128|zint16|zint160|zint2048|zint256|zint32|zint4096|zint512|zint64|zint8|zint80|zint8192|zmint|zsmint|zuamint|zuint1024|zuint128|zuint16|zuint160|zuint2048|zuint256|zuint32|zuint4096|zuint512|zuint64|zuint8|zuint80|zuint8192|zumint)$'
        add: [Custom0, Custom2]  # malterlib.keyword.builtin.integer.types
      - regex: '^(long|short|signed|unsigned)$'
        add: [Custom0, Custom3]  # malterlib.keyword.builtin.type.modifiers
      - regex: '^(bint|bool|void|zbint|zbool)$'
        add: [Custom0, Custom4]  # malterlib.keyword.builtin.types
      - regex: '^(__m128|__m128d|__m128i|__m64|__w64)$'
        add: [Custom0, Custom5]  # malterlib.keyword.builtin.vector.types
      - regex: '^auto$'
        add: [Custom4]  # malterlib.keyword.auto
    Parameter:
      - regex: '^_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom1, Custom2, Custom4, Custom6]  # malterlib.function.parameter.functor
      - regex: '^(p_of[A-Z][A-Za-z0-9_]*|po_f[A-Z][A-Za-z0-9_]*)$'
        add: [Custom3, Custom4, Custom6]  # malterlib.function.parameter.output.pack.functor
      - regex: '^(_of[A-Z][A-Za-z0-9_]*|o_f[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom1, Custom3, Custom5]  # malterlib.function.parameter.output.functor
      - regex: '^(p_o([binpfro]?[A-Z][A-Za-z0-9_]*)|po_([binpfro]?[A-Z][A-Za-z0-9_]*))$'
        add: [Custom0, Custom3, Custom4, Custom6]  # malterlib.function.parameter.output.pack
      - regex: '^(_o([binpfro]?[A-Z][A-Za-z0-9_]*)|o_([binpfro]?[A-Z][A-Za-z0-9_]*))$'
        add: [Custom1, Custom2, Custom5, Custom6]  # malterlib.function.parameter.output
    Field:
      - regex: '^m_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom2, Custom4, Custom5]  # malterlib.member.variable.public.functor
      - regex: '^mp_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom2, Custom4, Custom6]  # malterlib.member.variable.private.functor
    LocalVariable:
      - regex: '^(fl_[A-Z][A-Za-z0-9_]*|f[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom1, Custom4, Custom5]  # malterlib.variable.functor
    Unknown:
      - regex: '^memory_order$'
        add: [Custom0]  # malterlib.enum
      - regex: '^(memory_order_acq_rel|memory_order_acquire|memory_order_consume|memory_order_relaxed|memory_order_release|memory_order_seq_cst)$'
        add: [Custom1]  # malterlib.enumerator
      - regex: '^(allocate_shared|bind|const_pointer_cast|declval|dynamic_pointer_cast|forward|forward_as_tuple|get_deleter|getline|make_pair|make_shared|make_tuple|max|min|move|move_if_noexcept|static_pointer_cast|tie|tuple_cat)$'
        add: [Custom2]  # malterlib.function
      - regex: '^(friend|private|protected|public)$'
        add: [Custom3]  # malterlib.keyword.access
      - regex: '^auto$'
        add: [Custom4]  # malterlib.keyword.auto
      - regex: '^(__wchar_t|ch16|ch32|ch8|char|char16_t|char32_t|uch16|uch32|uch8|wchar_t|zch16|zch32|zch8|zuch16|zuch32|zuch8)$'
        add: [Custom5]  # malterlib.keyword.builtin.character.types
      - regex: '^(NULL|false|nullptr|true)$'
        add: [Custom6]  # malterlib.keyword.builtin.constants
      - regex: '^(double|float|fp1024|fp128|fp16|fp2048|fp256|fp32|fp4096|fp512|fp64|fp8|fp80|ufp1024|ufp128|ufp16|ufp2048|ufp256|ufp32|ufp4096|ufp512|ufp64|ufp8|ufp80|zfp1024|zfp128|zfp16|zfp2048|zfp256|zfp32|zfp4096|zfp512|zfp64|zfp8|zfp80|zufp1024|zufp128|zufp16|zufp2048|zufp256|zufp32|zufp4096|zufp512|zufp64|zufp8|zufp80)$'
        add: [Custom0, Custom1]  # malterlib.keyword.builtin.float.types
      - regex: '^(__int16|__int32|__int64|__int8|aint|int|int1024|int128|int16|int160|int2048|int256|int32|int4096|int512|int64|int8|int80|int8192|mint|size_t|smint|uaint|uint1024|uint128|uint16|uint160|uint2048|uint256|uint32|uint4096|uint512|uint64|uint8|uint80|uint8192|umint|zamint|zint1024|zint128|zint16|zint160|zint2048|zint256|zint32|zint4096|zint512|zint64|zint8|zint80|zint8192|zmint|zsmint|zuamint|zuint1024|zuint128|zuint16|zuint160|zuint2048|zuint256|zuint32|zuint4096|zuint512|zuint64|zuint8|zuint80|zuint8192|zumint)$'
        add: [Custom0, Custom2]  # malterlib.keyword.builtin.integer.types
      - regex: '^(long|short|signed|unsigned)$'
        add: [Custom0, Custom3]  # malterlib.keyword.builtin.type.modifiers
      - regex: '^(bint|bool|void|zbint|zbool)$'
        add: [Custom0, Custom4]  # malterlib.keyword.builtin.types
      - regex: '^(__m128|__m128d|__m128i|__m64|__w64)$'
        add: [Custom0, Custom5]  # malterlib.keyword.builtin.vector.types
      - regex: '^(const_cast|dynamic_cast|reinterpret_cast|static_cast)$'
        add: [Custom0, Custom6]  # malterlib.keyword.casts
      - regex: '^(__abstract|__box|__delegate|__gc|__hook|__identifier|__nogc|__pin|__property|__sealed|__try_cast|__unhook|__value|abstract|array|delegate|event|friend_as|gcnew|generic|initonly|interface|interior_ptr|literal|ref|safecast|value)$'
        add: [Custom1, Custom2]  # malterlib.keyword.clr
      - regex: '^(assume|break|case|constant_int64|constant_uint64|continue|default|do|else|for|goto|if|likely|return|switch|unlikely|while|yield_cpu)$'
        add: [Custom1, Custom3]  # malterlib.keyword.control.statement
      - regex: '^(__except|__finally|__leave|__raise|__try|catch|finally|throw|try)$'
        add: [Custom1, Custom4]  # malterlib.keyword.exception.handling
      - regex: '^(__alignof|__uuidof|decltype|sizeof|typeid)$'
        add: [Custom1, Custom5]  # malterlib.keyword.introspection
      - regex: '^namespace$'
        add: [Custom1, Custom6]  # malterlib.keyword.namespace
      - regex: '^(delete|new)$'
        add: [Custom2, Custom3]  # malterlib.keyword.new.delete
      - regex: '^operator$'
        add: [Custom2, Custom4]  # malterlib.keyword.operator
      - regex: '^(__asm|__assume)$'
        add: [Custom2, Custom5]  # malterlib.keyword.optimization
      - regex: '^(__event|__if_exists|__if_not_exists|__interface|__multiple_inheritance|__noop|__single_inheritance|__super|__virtual_inheritance)$'
        add: [Custom2, Custom6]  # malterlib.keyword.other
      - regex: '^(__attribute__|__based|__cdecl|__declspec|__fastcall|__forceinline|__inline|__pragma|__restrict__|__stdcall|__thiscall|__unaligned|align_cacheline|assure_used|calling_convention_c|carries_dependency|cdecl|constexpr|deprecated|dllexport|dllimport|explicit|fallthrough|fastcall|function_does_not_return|ignore|inline|inline_always|inline_always_debug|inline_always_lambda|inline_extralarge|inline_large|inline_medium|inline_never|inline_never_debug|inline_small|intrinsic|mark_artificial|mark_no_coroutine_debug|mark_nodebug|maybe_unused|module_export|module_import|naked|no_unique_address|nodiscard|noexcept|noinline|noreturn|nothrow|novtable|only_parameters_aliased|optimize_for_synchronized|property|return_not_aliased|selectany|stdcall|str_utf16|str_utf32|str_utf8|thread|uuid|variable_not_aliased)$'
        add: [Custom3, Custom4]  # malterlib.keyword.property.modifiers
      - regex: '^(\[\[|\]\])$'
        add: [Custom3, Custom5]  # malterlib.keyword.property.modifiers.brackets
      - regex: '^pure$'
        add: [Custom3, Custom6]  # malterlib.keyword.pure
      - regex: '^(const|volatile)$'
        add: [Custom4, Custom5]  # malterlib.keyword.qualifier
      - regex: '^static_assert$'
        add: [Custom4, Custom6]  # malterlib.keyword.static.assert
      - regex: '^(extern|mutable|register|static)$'
        add: [Custom5, Custom6]  # malterlib.keyword.storage.class
      - regex: '^template$'
        add: [Custom0, Custom1, Custom2]  # malterlib.keyword.template
      - regex: '^this$'
        add: [Custom0, Custom1, Custom3]  # malterlib.keyword.this
      - regex: '^(class|enum|struct|union)$'
        add: [Custom0, Custom1, Custom4]  # malterlib.keyword.type.specification
      - regex: '^typedef$'
        add: [Custom0, Custom1, Custom5]  # malterlib.keyword.typedef
      - regex: '^typename$'
        add: [Custom0, Custom1, Custom6]  # malterlib.keyword.typename
      - regex: '^using$'
        add: [Custom0, Custom2, Custom3]  # malterlib.keyword.using
      - regex: '^(final|override|sealed|virtual)$'
        add: [Custom0, Custom2, Custom4]  # malterlib.keyword.virtual
      - regex: '^assert$'
        add: [Custom0, Custom2, Custom5]  # malterlib.macro
      - regex: '^npos$'
        add: [Custom0, Custom2, Custom6]  # malterlib.member.constant.public
      - regex: '^(assign|at|back|before_begin|bucket|bucket_count|bucket_size|c_str|capacity|cbefore_begin|clear|compare|compare_exchange_strong|compare_exchange_weak|copy|count|data|emplace|emplace_after|emplace_back|emplace_front|emplace_hint|empty|equal_range|erase|erase_after|exchange|fetch_add|fetch_and|fetch_or|fetch_sub|fetch_xor|fill|find|find_first_not_of|find_first_of|find_last_of|fint_last_not_of|front|get_allocator|hash_fuction|insert|insert_after|is_lock_free|key_comp|key_eq|length|load|load_factor|lower_bound|max_bucket_count|max_load_factor|max_size|merge|pop|pop_back|pop_front|push|push_back|push_front|rehash|remove|remove_if|reserve|resize|reverse|rfind|shrink_to_fit|size|sort|splice|splice_after|store|substr|top|unique|upper_bound|value_comp)$'
        add: [Custom0, Custom3, Custom4]  # malterlib.member.function.public
      - regex: '^std$'
        add: [Custom0, Custom3, Custom5]  # malterlib.namespace
      - regex: '^(\#define|\#elif|\#else|\#endif|\#error|\#if|\#ifdef|\#ifndef|\#import|\#include|\#line|\#pragma|\#undef|\#using|define|defined|elif|endif|error|ifdef|ifndef|import|include|line|once|pragma|undef)$'
        add: [Custom0, Custom3, Custom6]  # malterlib.preprocessor.directive
      - regex: '^(add_const|add_cv|add_lvalue_reference|add_pointer|add_rvalue_reference|add_volatile|aligned_storage|aligned_union|alignment_of|allocator|atomic|auto_ptr_ref|basic_filebuf|basic_fstream|basic_ifstream|basic_ofstream|basic_string|char_traits|common_type|conditional|decay|default_delete|deque|enable_if|enable_shared_from_this|extent|forward_list|function|has_virtual_destructor|integral_constant|is_abstract|is_arithmetic|is_array|is_assignable|is_base_of|is_class|is_compound|is_const|is_constructible|is_convertible|is_copy_assignable|is_copy_constructible|is_default_constructible|is_destructible|is_empty|is_enum|is_floating_point|is_function|is_fundamental|is_integral|is_literal_type|is_lvalue_reference|is_member_function_pointer|is_member_object_pointer|is_member_pointer|is_move_assignable|is_move_constructible|is_nothrow_assignable|is_nothrow_constructible|is_nothrow_copy_assignable|is_nothrow_copy_constructible|is_nothrow_default_constructible|is_nothrow_destructible|is_nothrow_move_assignable|is_nothrow_move_constructible|is_object|is_pod|is_pointer|is_polymorphic|is_reference|is_rvalue_reference|is_same|is_scalar|is_signed|is_standard_layout|is_trivial|is_trivially_assignable|is_trivially_constructible|is_trivially_copy_assignable|is_trivially_copy_constructible|is_trivially_copyable|is_trivially_default_constructible|is_trivially_destructible|is_trivially_move_assignable|is_trivially_move_constructible|is_union|is_unsigned|is_void|is_volatile|list|make_signed|make_unsigned|map|multimap|multiset|owner_less|pair|priority_queue|queue|rank|remove_all_extents|remove_const|remove_cv|remove_extent|remove_pointer|remove_reference|remove_volatile|result_of|set|shared_ptr|stack|tuple|underlying_type|unique_ptr|unordered_map|unordered_multimap|unordered_multiset|unordered_set|vector|weak_ptr)$'
        add: [Custom0, Custom4, Custom5]  # malterlib.template.type
      - regex: '^(CFStr|CFUStr|CFWStr|allocator_type|atomic_flag|char_type|const_iterator|const_local_iterator|const_pointer|const_reference|const_reverse_iterator|difference_type|false_type|filebuf|fstream|hasher|ifstream|int_type|iterator|key_compare|key_equal|key_type|local_iterator|mapped_type|off_type|ofstream|pointer|pos_type|reference|reverse_iterator|size_type|state_type|string|traits_type|true_type|type|u16string|u32string|value_compare|value_type|wfilebuf|wfstream|wifstream|wofstream|wstring)$'
        add: [Custom0, Custom4, Custom6]  # malterlib.type
      - regex: '^(CFUStr[A-Z][A-Za-z0-9_]*|CFWStr[A-Z][A-Za-z0-9_]*|CFStr[A-Z][A-Za-z0-9_]*|CF[A-Z][A-Za-z0-9_]*Ref|NS[A-Z][A-Za-z0-9_]*|UI[A-Z][A-Za-z0-9_]*|C[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom4, Custom6]  # malterlib.type
      - regex: '^(tfp_TC[A-Z][A-Za-z0-9_]*|tfp_TF[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom5, Custom6]  # malterlib.function.template.template.param.pack
      - regex: '^(fsg_r[A-Z][A-Za-z0-9_]*|fsgr_[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom2, Custom3]  # malterlib.static.function.recursive
      - regex: '^(fsp_r[A-Z][A-Za-z0-9_]*|fspr_[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom2, Custom4]  # malterlib.member.static.function.private.recursive
      - regex: '^msp_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom1, Custom2, Custom5]  # malterlib.member.static.variable.private.functor
      - regex: '^(tf_TC[A-Z][A-Za-z0-9_]*|tf_TF[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom2, Custom6]  # malterlib.function.template.template.param
      - regex: '^tfp_C[A-Z][A-Za-z0-9_]*$'
        add: [Custom1, Custom3, Custom4]  # malterlib.function.template.type.param.class.pack
      - regex: '^tfp_F[A-Z][A-Za-z0-9_]*$'
        add: [Custom1, Custom3, Custom5]  # malterlib.function.template.type.param.function.pack
      - regex: '^(tp_TC[A-Z][A-Za-z0-9_]*|tp_TF[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom3, Custom6]  # malterlib.template.template.param.pack
      - regex: '^(fg_r[A-Z][A-Za-z0-9_]*|fgr_[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom4, Custom5]  # malterlib.function.recursive
      - regex: '^(fp_r[A-Z][A-Za-z0-9_]*|fpr_[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom4, Custom6]  # malterlib.member.function.private.recursive
      - regex: '^(fs_r[A-Z][A-Za-z0-9_]*|fsr_[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom5, Custom6]  # malterlib.member.static.function.public.recursive
      - regex: '^fsg_[A-Z][A-Za-z0-9_]*$'
        add: [Custom2, Custom3, Custom4]  # malterlib.static.function
      - regex: '^fsp_[A-Z][A-Za-z0-9_]*$'
        add: [Custom2, Custom3, Custom5]  # malterlib.member.static.function.private
      - regex: '^gs_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom2, Custom3, Custom6]  # malterlib.global.static.variable.functor
      - regex: '^mcp_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom2, Custom4, Custom5]  # malterlib.member.constant.private
      - regex: '^mp_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom2, Custom4, Custom6]  # malterlib.member.variable.private.functor
      - regex: '^ms_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom2, Custom5, Custom6]  # malterlib.member.static.variable.public.functor
      - regex: '^msp_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom3, Custom4, Custom5]  # malterlib.member.static.variable.private
      - regex: '^(p_of[A-Z][A-Za-z0-9_]*|po_f[A-Z][A-Za-z0-9_]*)$'
        add: [Custom3, Custom4, Custom6]  # malterlib.function.parameter.output.pack.functor
      - regex: '^(t_TC[A-Z][A-Za-z0-9_]*|t_TF[A-Z][A-Za-z0-9_]*)$'
        add: [Custom3, Custom5, Custom6]  # malterlib.template.template.param
      - regex: '^tf_C[A-Z][A-Za-z0-9_]*$'
        add: [Custom4, Custom5, Custom6]  # malterlib.function.template.type.param.class
      - regex: '^tf_F[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom1, Custom2, Custom3]  # malterlib.function.template.type.param.function
      - regex: '^tfp_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom1, Custom2, Custom4]  # malterlib.function.template.non.type.param.pack
      - regex: '^tp_C[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom1, Custom2, Custom5]  # malterlib.template.type.param.class.pack
      - regex: '^tp_F[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom1, Custom2, Custom6]  # malterlib.template.type.param.function.pack
      - regex: '^TIC[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom1, Custom3, Custom4]  # malterlib.template.type.interface
      - regex: '^(_of[A-Z][A-Za-z0-9_]*|o_f[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom1, Custom3, Custom5]  # malterlib.function.parameter.output.functor
      - regex: '^(f_r[A-Z][A-Za-z0-9_]*|fr_[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom1, Custom3, Custom6]  # malterlib.member.function.public.recursive
      - regex: '^(fg_[A-Z][A-Za-z0-9_]*|CF[A-Z][A-Za-z0-9_]*)$'
        add: [Custom2]  # malterlib.function
      - regex: '^(fl_[A-Z][A-Za-z0-9_]*|f[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom1, Custom4, Custom5]  # malterlib.variable.functor
      - regex: '^fp_[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom1, Custom4, Custom6]  # malterlib.member.function.private
      - regex: '^fs_[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom1, Custom5, Custom6]  # malterlib.member.static.function.public
      - regex: '^g_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom2, Custom3, Custom4]  # malterlib.global.variable.functor
      - regex: '^gc_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom2, Custom3, Custom5]  # malterlib.global.constant
      - regex: '^gs_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom2, Custom3, Custom6]  # malterlib.global.static.variable
      - regex: '^m_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom2, Custom4, Custom5]  # malterlib.member.variable.public.functor
      - regex: '^mc_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom2, Custom6]  # malterlib.member.constant.public
      - regex: '^mp_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom2, Custom4, Custom6]  # malterlib.member.variable.private
      - regex: '^ms_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom2, Custom5, Custom6]  # malterlib.member.static.variable.public
      - regex: '^p_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom3, Custom4, Custom5]  # malterlib.function.parameter.pack.functor
      - regex: '^(p_o([binpfro]?[A-Z][A-Za-z0-9_]*)|po_([binpfro]?[A-Z][A-Za-z0-9_]*))$'
        add: [Custom0, Custom3, Custom4, Custom6]  # malterlib.function.parameter.output.pack
      - regex: '^s_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom3, Custom5, Custom6]  # malterlib.static.variable.functor
      - regex: '^t_C[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom4, Custom5, Custom6]  # malterlib.template.type.param.class
      - regex: '^t_F[A-Z][A-Za-z0-9_]*$'
        add: [Custom1, Custom2, Custom3, Custom4]  # malterlib.template.type.param.function
      - regex: '^tf_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom2, Custom3, Custom5]  # malterlib.function.template.non.type.param
      - regex: '^tp_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom2, Custom3, Custom6]  # malterlib.template.non.type.param.pack
      - regex: '^IC[A-Z][A-Za-z0-9_]*$'
        add: [Custom1, Custom2, Custom4, Custom5]  # malterlib.type.interface
      - regex: '^(TC[A-Z][A-Za-z0-9_]*|TF[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom4, Custom5]  # malterlib.template.type
      - regex: '^_f[A-Z][A-Za-z0-9_]*$'
        add: [Custom1, Custom2, Custom4, Custom6]  # malterlib.function.parameter.functor
      - regex: '^(_o([binpfro]?[A-Z][A-Za-z0-9_]*)|o_([binpfro]?[A-Z][A-Za-z0-9_]*))$'
        add: [Custom1, Custom2, Custom5, Custom6]  # malterlib.function.parameter.output
      - regex: '^c_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom3, Custom4, Custom5]  # malterlib.constant.variable
      - regex: '^d_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom3, Custom4, Custom6]  # malterlib.macro.parameter
      - regex: '^f_[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom3, Custom4]  # malterlib.member.function.public
      - regex: '^g_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom3, Custom5, Custom6]  # malterlib.global.variable
      - regex: '^m_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1, Custom4, Custom5, Custom6]  # malterlib.member.variable.public
      - regex: '^p_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom2, Custom3, Custom4, Custom5]  # malterlib.function.parameter.pack
      - regex: '^s_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom2, Custom3, Custom4, Custom6]  # malterlib.static.variable
      - regex: '^t_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom2, Custom3, Custom5, Custom6]  # malterlib.template.non.type.param
      - regex: '^D[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom2, Custom5]  # malterlib.macro
      - regex: '^(E[A-Z][A-Za-z0-9_]*_[A-Za-z0-9_]*|k[A-Z][A-Za-z0-9_]*)$'
        add: [Custom1]  # malterlib.enumerator
      - regex: '^E[A-Z][A-Za-z0-9]*$'
        add: [Custom0]  # malterlib.enum
      - regex: '^F[A-Z][A-Za-z0-9_]*$'
        add: [Custom2, Custom4, Custom5, Custom6]  # malterlib.type.function
      - regex: '^N[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom3, Custom5]  # malterlib.namespace
      - regex: '^_([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom3, Custom4, Custom5, Custom6]  # malterlib.function.parameter
      - regex: '^c[A-Z][A-Za-z0-9_]*$'
        add: [Custom0, Custom1, Custom2, Custom3, Custom4]  # malterlib.concept
      - regex: '^([binpfro]?[A-Z][A-Za-z0-9_]*)$'
        add: [Custom0, Custom1, Custom2, Custom3, Custom5]  # malterlib.variable
```
</details>

---

## Release Notes

### 1.0.0

* Initial release of Malterlib VSCode

### 1.0.1

* Add support for Malterlib Build highlighting

### 1.0.2

* Highlight scope bug fixes

### 1.0.3

* Add support for Display P3 color space

### 1.0.4

* Remove the extension to Malterlib only
* Add Malterlib and Malterlib (sRGB) themes
* Add support for clangd formatting
* Add support for customized clangd shipping with Malterlib
* Add an option to enable Malterlib custom semantic highlighting. Disabled by default, use when you don't have the custom clangd shipped with Malterlib (or when you want faster highlighting).
* Do perceptual color conversion between Display P3 and sRGB colors
* Improve syntax highlighting for other languages

### 1.0.5

* Update colors in theme

### 1.0.6

* Update debug variable view colors
