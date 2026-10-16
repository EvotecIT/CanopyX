using System;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>Member selectors retain the C# expression's conversions in columns and record fields.</summary>
public sealed class TypedConversionTests {
    public enum Status { Active = 3 }
    public readonly struct Price {
        public Price(int cents) { Cents = cents; }
        public int Cents { get; }
        public static explicit operator double(Price price) => price.Cents / 100.0;
    }
    public class Owner { }
    public sealed class NamedOwner : Owner { public string Name { get; set; } = "Team"; }
    public sealed class Item {
        public int Number { get; set; } = 300;
        public int? Optional { get; set; } = 12;
        public Status State { get; set; } = Status.Active;
        public Owner? Owner { get; set; }
        public int PriceReads { get; private set; }
        public Price Price { get { PriceReads++; return new Price(250); } }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ConvertedSelector_PassesTheConvertedTypeToCustomCells(bool field) {
        var grid = Grid();
        if (field) grid.Field("value", x => (double)x.Number, cell: value => new CanopyCell(value));
        else grid.Column("value", x => (double)x.Number, cell: value => new CanopyCell(value));
        Assert.Equal(300d, Cell(grid.Row(new Item()), field).Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NarrowedSelector_UsesTheCSharpConvertedValue(bool field) {
        var grid = Grid();
        if (field) grid.Field("value", x => (byte)x.Number);
        else grid.Column("value", x => (byte)x.Number);
        Assert.Equal(44L, Cell(grid.Row(new Item()), field).Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void CheckedSelector_ReportsOverflow(bool field) {
        var grid = Grid();
        if (field) grid.Field("value", x => checked((byte)x.Number));
        else grid.Column("value", x => checked((byte)x.Number));
        Assert.Throws<OverflowException>(() => grid.Row(new Item()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void EnumConversion_InfersTheConvertedNumericKind(bool field) {
        var grid = Grid();
        var column = field ? grid.Field("value", x => (int)x.State) : grid.Column("value", x => (int)x.State);
        Assert.Equal(CanopyColumnKind.Number, column.Kind);
        Assert.Equal(3L, Cell(grid.Row(new Item()), field).Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void LiftedSelector_PreservesPopulatedAndNullConversions(bool field) {
        var grid = Grid();
        if (field) grid.Field("value", x => (long?)x.Optional, cell: value => new CanopyCell(value ?? 0L));
        else grid.Column("value", x => (long?)x.Optional, cell: value => new CanopyCell(value ?? 0L));
        Assert.Equal(12L, Cell(grid.Row(new Item()), field).Value);
        Assert.Equal(0L, Cell(grid.Row(new Item { Optional = null }), field).Value);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ConvertedReceiver_KeepsNullChainsEmptyAndRejectsInvalidCasts(bool field) {
        var grid = Grid();
        if (field) grid.Field("value", x => ((NamedOwner)x.Owner!).Name);
        else grid.Column("value", x => ((NamedOwner)x.Owner!).Name);
        Assert.Equal("Team", Cell(grid.Row(new Item { Owner = new NamedOwner() }), field).Value);
        var empty = grid.Row(new Item());
        Assert.False((field ? empty.Fields : empty.Cells).ContainsKey("value"));
        Assert.Throws<InvalidCastException>(() => grid.Row(new Item { Owner = new Owner() }));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void UserDefinedConversion_ExecutesOnceAndInfersItsResultKind(bool field) {
        var grid = Grid();
        var column = field ? grid.Field("value", x => (double)x.Price) : grid.Column("value", x => (double)x.Price);
        var item = new Item();
        Assert.Equal(CanopyColumnKind.Number, column.Kind);
        Assert.Equal(2.5d, Cell(grid.Row(item), field).Value);
        Assert.Equal(1, item.PriceReads);
    }

    private static CanopyDataGridView<Item> Grid() => new CanopyDataGridView<Item>("items", "Items", _ => "one");
    private static CanopyCell Cell(CanopyGridRow row, bool field) => field ? row.Fields["value"] : row.Cells["value"];
}
