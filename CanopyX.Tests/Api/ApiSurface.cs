#if NET
using System.Globalization;
using System.Reflection;
using System.Text;
using Xunit;

namespace CanopyX.Tests.Api;

/// <summary>
/// The public API of an assembly as sorted text lines (types, their kinds, bases, constraints and obsolete marks, and every
/// public or protected member with its signature, nullability and constant values), checked against the baseline under
/// <c>api/</c>. A test fails on any difference; setting <c>CANOPYX_API_UPDATE=1</c> rewrites the baseline after an intended
/// change (see docs/versioning.md). The baselines describe the .NET 10 build.
/// </summary>
internal static class ApiSurface {
    private static readonly NullabilityInfoContext Nullability = new NullabilityInfoContext();
    // Interfaces every enum, delegate or struct has from the platform; the target framework, not the API, decides them.
    private static readonly HashSet<Type> PlatformInterfaces = new HashSet<Type>(typeof(Enum).GetInterfaces().Concat(typeof(MulticastDelegate).GetInterfaces()).Concat(typeof(ValueType).GetInterfaces()));

    internal static void AssertMatches(Assembly assembly, string baseline) {
        var lines = Describe(assembly);
        var path = Path.Combine(RepositoryRoot(), "api", baseline);
        var text = "# Public API of " + assembly.GetName().Name + ", checked by the API tests. Regenerate with CANOPYX_API_UPDATE=1 after an intended change." + "\n" + string.Join("\n", lines) + "\n";
        if (Environment.GetEnvironmentVariable("CANOPYX_API_UPDATE") == "1") {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, text, new UTF8Encoding(false));
            return;
        }
        var current = File.Exists(path) ? File.ReadAllText(path).Replace("\r\n", "\n") : string.Empty;
        if (current == text) return;
        var before = new HashSet<string>(current.Split('\n'), StringComparer.Ordinal);
        var after = new HashSet<string>(text.Split('\n'), StringComparer.Ordinal);
        var report = new StringBuilder("The public API of " + assembly.GetName().Name + " changed without an updated api/" + baseline + ". " +
            "Set CANOPYX_API_UPDATE=1 and run the tests again if the change is intended, and follow docs/versioning.md.\n");
        foreach (var line in before.Where(line => !after.Contains(line)).Take(40)) report.Append("- ").Append(line).Append('\n');
        foreach (var line in after.Where(line => !before.Contains(line)).Take(40)) report.Append("+ ").Append(line).Append('\n');
        Assert.Fail(report.ToString());
    }

    internal static List<string> Describe(Assembly assembly) {
        var lines = new List<string>();
        foreach (var type in assembly.GetExportedTypes()) {
            var name = Name(type);
            lines.Add(Obsolete(type) + name + " : " + Kind(type) + Bases(type) + Constraints(type.IsGenericTypeDefinition ? type.GetGenericArguments() : Type.EmptyTypes));
            const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
            foreach (var member in type.GetMembers(flags)) {
                var line = Member(member);
                if (line != null) lines.Add(name + "." + Obsolete(member) + line);
            }
        }
        lines.Sort(StringComparer.Ordinal);
        return lines;
    }

    private static string Kind(Type type) =>
        type.IsEnum ? "enum " + Name(Enum.GetUnderlyingType(type)) : type.IsInterface ? "interface" : type.IsValueType ? "struct" :
        typeof(Delegate).IsAssignableFrom(type) ? "delegate" : (type.IsAbstract && type.IsSealed ? "static class" : type.IsSealed ? "sealed class" : type.IsAbstract ? "abstract class" : "class");

    private static string Bases(Type type) {
        var bases = new List<string>();
        if (type.BaseType != null && type.BaseType != typeof(object) && type.BaseType != typeof(ValueType) && type.BaseType != typeof(Enum) && !typeof(Delegate).IsAssignableFrom(type)) bases.Add(Name(type.BaseType));
        bases.AddRange(type.GetInterfaces().Where(item => (item.IsPublic || item.IsNestedPublic) && !PlatformInterfaces.Contains(item)).Select(Name).OrderBy(item => item, StringComparer.Ordinal));
        return bases.Count == 0 ? string.Empty : " (" + string.Join(", ", bases) + ")";
    }

    private static string Constraints(Type[] parameters) {
        var clauses = new List<string>();
        foreach (var parameter in parameters.Where(item => item.IsGenericParameter)) {
            var parts = new List<string>();
            var attributes = parameter.GenericParameterAttributes;
            if ((attributes & GenericParameterAttributes.ReferenceTypeConstraint) != 0) parts.Add("class");
            if ((attributes & GenericParameterAttributes.NotNullableValueTypeConstraint) != 0) parts.Add("struct");
            parts.AddRange(parameter.GetGenericParameterConstraints().Where(item => item != typeof(ValueType)).Select(Name));
            if ((attributes & GenericParameterAttributes.DefaultConstructorConstraint) != 0 && (attributes & GenericParameterAttributes.NotNullableValueTypeConstraint) == 0) parts.Add("new()");
            if (parts.Count > 0) clauses.Add(" where " + parameter.Name + " : " + string.Join(", ", parts));
        }
        return string.Concat(clauses);
    }

    private static string Obsolete(MemberInfo member) {
        var obsolete = member.GetCustomAttribute<ObsoleteAttribute>(false);
        return obsolete == null ? string.Empty : "[Obsolete(\"" + obsolete.Message + "\"" + (obsolete.IsError ? ", error" : string.Empty) + ")] ";
    }

    private static string? Member(MemberInfo member) {
        switch (member) {
            case ConstructorInfo constructor when Visible(constructor):
                return Access(constructor) + ".ctor(" + Parameters(constructor.GetParameters()) + ")";
            case MethodInfo method when Visible(method) && (!method.IsSpecialName || method.Name.StartsWith("op_", StringComparison.Ordinal)):
                return Access(method) + (method.IsStatic ? "static " : method.IsAbstract ? "abstract " : method.IsVirtual && !method.IsFinal ? "virtual " : string.Empty) +
                    Name(method.ReturnParameter) + " " + method.Name + Generic(method) + "(" + Parameters(method.GetParameters()) + ")" +
                    Constraints(method.IsGenericMethodDefinition ? method.GetGenericArguments() : Type.EmptyTypes);
            case PropertyInfo property:
                var getter = property.GetGetMethod(true); var setter = property.GetSetMethod(true);
                var get = getter != null && Visible(getter); var set = setter != null && Visible(setter);
                if (!get && !set) return null;
                var index = property.GetIndexParameters();
                var init = set && setter!.ReturnParameter.GetRequiredCustomModifiers().Any(item => item.Name == "IsExternalInit");
                return ((getter ?? setter)!.IsStatic ? "static " : string.Empty) + Name(property) + " " + property.Name +
                    (index.Length > 0 ? "[" + Parameters(index) + "]" : string.Empty) + " {" +
                    (get ? " " + Access(getter!) + "get;" : string.Empty) + (set ? " " + Access(setter!) + (init ? "init;" : "set;") : string.Empty) + " }";
            case FieldInfo field when (field.IsPublic || field.IsFamily || field.IsFamilyOrAssembly) && !field.IsSpecialName:
                // Constant values are compiled into callers, so a changed value is a changed API.
                return (field.IsPublic ? string.Empty : "protected ") + (field.IsLiteral ? "const " : field.IsStatic ? "static " : string.Empty) + (field.IsInitOnly ? "readonly " : string.Empty) +
                    Name(field) + " " + field.Name + (field.IsLiteral ? " = " + Value(field.GetRawConstantValue()) : string.Empty);
            case EventInfo @event when @event.AddMethod != null && Visible(@event.AddMethod):
                return Access(@event.AddMethod) + "event " + Name(@event.EventHandlerType!) + " " + @event.Name;
            default:
                return null;
        }
    }

    private static bool Visible(MethodBase method) => method.IsPublic || method.IsFamily || method.IsFamilyOrAssembly;

    private static string Access(MethodBase method) => method.IsPublic ? string.Empty : "protected ";

    private static string Generic(MethodInfo method) =>
        method.IsGenericMethodDefinition ? "<" + string.Join(", ", method.GetGenericArguments().Select(Name)) + ">" : string.Empty;

    private static string Parameters(ParameterInfo[] parameters) => string.Join(", ", parameters.Select(parameter =>
        (parameter.IsOut ? "out " : parameter.IsIn && parameter.ParameterType.IsByRef ? "in " : parameter.ParameterType.IsByRef ? "ref " : string.Empty) +
        (parameter.IsDefined(typeof(ParamArrayAttribute)) ? "params " : string.Empty) + Name(parameter) + " " + parameter.Name +
        (parameter.HasDefaultValue ? " = " + Value(parameter.DefaultValue) : string.Empty)));

    private static string Value(object? value) => value switch {
        null => "null",
        string text => "\"" + text + "\"",
        _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty
    };

    // Names with nullable reference annotations (string?), read from the member's nullability.
    private static string Name(ParameterInfo parameter) => Name(parameter.ParameterType, Nullability.Create(parameter));
    private static string Name(PropertyInfo property) => Name(property.PropertyType, Nullability.Create(property));
    private static string Name(FieldInfo field) => Name(field.FieldType, Nullability.Create(field));

    private static string Name(Type type, NullabilityInfo info) {
        if (type.IsByRef) return Name(type.GetElementType()!, info);
        var name = type.IsArray && info.ElementType != null ? Name(type.GetElementType()!, info.ElementType) + "[" + new string(',', type.GetArrayRank() - 1) + "]" :
            type.IsGenericType && !type.IsGenericTypeDefinition && Nullable.GetUnderlyingType(type) == null && info.GenericTypeArguments.Length == type.GetGenericArguments().Length ?
                Base(type) + "<" + string.Join(", ", type.GetGenericArguments().Select((argument, index) => Name(argument, info.GenericTypeArguments[index]))) + ">" : Name(type);
        // An unconstrained type parameter reads as nullable either way, so only concrete types carry the mark.
        return !type.IsValueType && !type.IsGenericParameter && info.ReadState == NullabilityState.Nullable ? name + "?" : name;
    }

    private static string Name(Type type) {
        if (type.IsByRef) return Name(type.GetElementType()!);
        if (type.IsArray) return Name(type.GetElementType()!) + "[" + new string(',', type.GetArrayRank() - 1) + "]";
        if (type.IsGenericParameter) return type.Name;
        if (!type.IsGenericType) return type.IsNested ? Name(type.DeclaringType!) + "." + type.Name : type.Namespace + "." + type.Name;
        var own = OwnArguments(type).ToList();
        return own.Count == 0 ? Base(type) : Base(type) + "<" + string.Join(", ", own.Select(Name)) + ">";
    }

    // A nested type of a generic type repeats its outer type's arguments; it names only its own.
    private static string Base(Type type) {
        var name = type.Name;
        var tick = name.IndexOf('`');
        name = tick < 0 ? name : name.Substring(0, tick);
        if (!type.IsNested) return type.Namespace + "." + name;
        var outer = type.DeclaringType!;
        if (outer.IsGenericTypeDefinition && type.IsConstructedGenericType) outer = outer.MakeGenericType(type.GetGenericArguments().Take(outer.GetGenericArguments().Length).ToArray());
        return Name(outer) + "." + name;
    }

    private static IEnumerable<Type> OwnArguments(Type type) {
        var arguments = type.GetGenericArguments();
        var inherited = type.IsNested ? type.DeclaringType!.GetGenericArguments().Length : 0;
        return arguments.Skip(inherited);
    }

    // The repository root above the test output (CallerFilePath is mapped in deterministic CI builds).
    private static string RepositoryRoot() {
        for (var directory = AppContext.BaseDirectory; directory != null; directory = Path.GetDirectoryName(directory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)))
            if (File.Exists(Path.Combine(directory, "CanopyX.sln"))) return directory;
        throw new InvalidOperationException("The repository root was not found above " + AppContext.BaseDirectory + ".");
    }
}
#endif
