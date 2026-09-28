using System;
using System.Collections.Generic;

namespace CanopyX;

internal static class CanopySearchFoldingTable {
    // Frozen single-UTF-16-unit lowercase pairs from Unicode 16.0; source and browser share these bytes.
    internal const string LowercasePairs =
        "QQBhAEIAYgBDAGMARABkAEUAZQBGAGYARwBnAEgAaABJAGkASgBqAEsAawBMAGwATQBtAE4AbgBPAG8AUABwAFEAcQBSAHIAUwBz" +
        "AFQAdABVAHUAVgB2AFcAdwBYAHgAWQB5AFoAegDAAOAAwQDhAMIA4gDDAOMAxADkAMUA5QDGAOYAxwDnAMgA6ADJAOkAygDqAMsA" +
        "6wDMAOwAzQDtAM4A7gDPAO8A0ADwANEA8QDSAPIA0wDzANQA9ADVAPUA1gD2ANgA+ADZAPkA2gD6ANsA+wDcAPwA3QD9AN4A/gAA" +
        "AQEBAgEDAQQBBQEGAQcBCAEJAQoBCwEMAQ0BDgEPARABEQESARMBFAEVARYBFwEYARkBGgEbARwBHQEeAR8BIAEhASIBIwEkASUB" +
        "JgEnASgBKQEqASsBLAEtAS4BLwEyATMBNAE1ATYBNwE5AToBOwE8AT0BPgE/AUABQQFCAUMBRAFFAUYBRwFIAUoBSwFMAU0BTgFP" +
        "AVABUQFSAVMBVAFVAVYBVwFYAVkBWgFbAVwBXQFeAV8BYAFhAWIBYwFkAWUBZgFnAWgBaQFqAWsBbAFtAW4BbwFwAXEBcgFzAXQB" +
        "dQF2AXcBeAH/AHkBegF7AXwBfQF+AYEBUwKCAYMBhAGFAYYBVAKHAYgBiQFWAooBVwKLAYwBjgHdAY8BWQKQAVsCkQGSAZMBYAKU" +
        "AWMClgFpApcBaAKYAZkBnAFvAp0BcgKfAXUCoAGhAaIBowGkAaUBpgGAAqcBqAGpAYMCrAGtAa4BiAKvAbABsQGKArIBiwKzAbQB" +
        "tQG2AbcBkgK4AbkBvAG9AcQBxgHFAcYBxwHJAcgByQHKAcwBywHMAc0BzgHPAdAB0QHSAdMB1AHVAdYB1wHYAdkB2gHbAdwB3gHf" +
        "AeAB4QHiAeMB5AHlAeYB5wHoAekB6gHrAewB7QHuAe8B8QHzAfIB8wH0AfUB9gGVAfcBvwH4AfkB+gH7AfwB/QH+Af8BAAIBAgIC" +
        "AwIEAgUCBgIHAggCCQIKAgsCDAINAg4CDwIQAhECEgITAhQCFQIWAhcCGAIZAhoCGwIcAh0CHgIfAiACngEiAiMCJAIlAiYCJwIo" +
        "AikCKgIrAiwCLQIuAi8CMAIxAjICMwI6AmUsOwI8Aj0CmgE+AmYsQQJCAkMCgAFEAokCRQKMAkYCRwJIAkkCSgJLAkwCTQJOAk8C" +
        "cANxA3IDcwN2A3cDfwPzA4YDrAOIA60DiQOuA4oDrwOMA8wDjgPNA48DzgORA7EDkgOyA5MDswOUA7QDlQO1A5YDtgOXA7cDmAO4" +
        "A5kDuQOaA7oDmwO7A5wDvAOdA70DngO+A58DvwOgA8ADoQPBA6MDwwOkA8QDpQPFA6YDxgOnA8cDqAPIA6kDyQOqA8oDqwPLA88D" +
        "1wPYA9kD2gPbA9wD3QPeA98D4APhA+ID4wPkA+UD5gPnA+gD6QPqA+sD7APtA+4D7wP0A7gD9wP4A/kD8gP6A/sD/QN7A/4DfAP/" +
        "A30DAARQBAEEUQQCBFIEAwRTBAQEVAQFBFUEBgRWBAcEVwQIBFgECQRZBAoEWgQLBFsEDARcBA0EXQQOBF4EDwRfBBAEMAQRBDEE" +
        "EgQyBBMEMwQUBDQEFQQ1BBYENgQXBDcEGAQ4BBkEOQQaBDoEGwQ7BBwEPAQdBD0EHgQ+BB8EPwQgBEAEIQRBBCIEQgQjBEMEJARE" +
        "BCUERQQmBEYEJwRHBCgESAQpBEkEKgRKBCsESwQsBEwELQRNBC4ETgQvBE8EYARhBGIEYwRkBGUEZgRnBGgEaQRqBGsEbARtBG4E" +
        "bwRwBHEEcgRzBHQEdQR2BHcEeAR5BHoEewR8BH0EfgR/BIAEgQSKBIsEjASNBI4EjwSQBJEEkgSTBJQElQSWBJcEmASZBJoEmwSc" +
        "BJ0EngSfBKAEoQSiBKMEpASlBKYEpwSoBKkEqgSrBKwErQSuBK8EsASxBLIEswS0BLUEtgS3BLgEuQS6BLsEvAS9BL4EvwTABM8E" +
        "wQTCBMMExATFBMYExwTIBMkEygTLBMwEzQTOBNAE0QTSBNME1ATVBNYE1wTYBNkE2gTbBNwE3QTeBN8E4AThBOIE4wTkBOUE5gTn" +
        "BOgE6QTqBOsE7ATtBO4E7wTwBPEE8gTzBPQE9QT2BPcE+AT5BPoE+wT8BP0E/gT/BAAFAQUCBQMFBAUFBQYFBwUIBQkFCgULBQwF" +
        "DQUOBQ8FEAURBRIFEwUUBRUFFgUXBRgFGQUaBRsFHAUdBR4FHwUgBSEFIgUjBSQFJQUmBScFKAUpBSoFKwUsBS0FLgUvBTEFYQUy" +
        "BWIFMwVjBTQFZAU1BWUFNgVmBTcFZwU4BWgFOQVpBToFagU7BWsFPAVsBT0FbQU+BW4FPwVvBUAFcAVBBXEFQgVyBUMFcwVEBXQF" +
        "RQV1BUYFdgVHBXcFSAV4BUkFeQVKBXoFSwV7BUwFfAVNBX0FTgV+BU8FfwVQBYAFUQWBBVIFggVTBYMFVAWEBVUFhQVWBYYFoBAA" +
        "LaEQAS2iEAItoxADLaQQBC2lEAUtphAGLacQBy2oEAgtqRAJLaoQCi2rEAstrBAMLa0QDS2uEA4trxAPLbAQEC2xEBEtshASLbMQ" +
        "Ey20EBQttRAVLbYQFi23EBctuBAYLbkQGS26EBotuxAbLbwQHC29EB0tvhAeLb8QHy3AECAtwRAhLcIQIi3DECMtxBAkLcUQJS3H" +
        "ECctzRAtLaATcKuhE3GrohNyq6MTc6ukE3SrpRN1q6YTdqunE3erqBN4q6kTeauqE3qrqxN7q6wTfKutE32rrhN+q68Tf6uwE4Cr" +
        "sROBq7ITgquzE4OrtBOEq7UThau2E4artxOHq7gTiKu5E4mruhOKq7sTi6u8E4yrvRONq74Tjqu/E4+rwBOQq8ETkavCE5KrwxOT" +
        "q8QTlKvFE5WrxhOWq8cTl6vIE5iryROZq8oTmqvLE5urzBOcq80TnavOE56rzxOfq9AToKvRE6Gr0hOiq9MTo6vUE6Sr1ROlq9YT" +
        "pqvXE6er2BOoq9kTqavaE6qr2xOrq9wTrKvdE62r3hOuq98Tr6vgE7Cr4ROxq+ITsqvjE7Or5BO0q+UTtavmE7ar5xO3q+gTuKvp" +
        "E7mr6hO6q+sTu6vsE7yr7RO9q+4TvqvvE7+r8BP4E/ET+RPyE/oT8xP7E/QT/BP1E/0TiRyKHJAc0BCRHNEQkhzSEJMc0xCUHNQQ" +
        "lRzVEJYc1hCXHNcQmBzYEJkc2RCaHNoQmxzbEJwc3BCdHN0QnhzeEJ8c3xCgHOAQoRzhEKIc4hCjHOMQpBzkEKUc5RCmHOYQpxzn" +
        "EKgc6BCpHOkQqhzqEKsc6xCsHOwQrRztEK4c7hCvHO8QsBzwELEc8RCyHPIQsxzzELQc9BC1HPUQthz2ELcc9xC4HPgQuRz5ELoc" +
        "+hC9HP0Qvhz+EL8c/xAAHgEeAh4DHgQeBR4GHgceCB4JHgoeCx4MHg0eDh4PHhAeER4SHhMeFB4VHhYeFx4YHhkeGh4bHhweHR4e" +
        "Hh8eIB4hHiIeIx4kHiUeJh4nHigeKR4qHiseLB4tHi4eLx4wHjEeMh4zHjQeNR42HjceOB45HjoeOx48Hj0ePh4/HkAeQR5CHkMe" +
        "RB5FHkYeRx5IHkkeSh5LHkweTR5OHk8eUB5RHlIeUx5UHlUeVh5XHlgeWR5aHlseXB5dHl4eXx5gHmEeYh5jHmQeZR5mHmceaB5p" +
        "Hmoeax5sHm0ebh5vHnAecR5yHnMedB51HnYedx54Hnkeeh57HnwefR5+Hn8egB6BHoIegx6EHoUehh6HHogeiR6KHosejB6NHo4e" +
        "jx6QHpEekh6THpQelR6eHt8AoB6hHqIeox6kHqUeph6nHqgeqR6qHqserB6tHq4erx6wHrEesh6zHrQetR62HrceuB65Hroeux68" +
        "Hr0evh6/HsAewR7CHsMexB7FHsYexx7IHskeyh7LHswezR7OHs8e0B7RHtIe0x7UHtUe1h7XHtge2R7aHtse3B7dHt4e3x7gHuEe" +
        "4h7jHuQe5R7mHuce6B7pHuoe6x7sHu0e7h7vHvAe8R7yHvMe9B71HvYe9x74Hvke+h77Hvwe/R7+Hv8eCB8AHwkfAR8KHwIfCx8D" +
        "HwwfBB8NHwUfDh8GHw8fBx8YHxAfGR8RHxofEh8bHxMfHB8UHx0fFR8oHyAfKR8hHyofIh8rHyMfLB8kHy0fJR8uHyYfLx8nHzgf" +
        "MB85HzEfOh8yHzsfMx88HzQfPR81Hz4fNh8/HzcfSB9AH0kfQR9KH0IfSx9DH0wfRB9NH0UfWR9RH1sfUx9dH1UfXx9XH2gfYB9p" +
        "H2Efah9iH2sfYx9sH2QfbR9lH24fZh9vH2cfiB+AH4kfgR+KH4Ifix+DH4wfhB+NH4Ufjh+GH48fhx+YH5AfmR+RH5ofkh+bH5Mf" +
        "nB+UH50flR+eH5Yfnx+XH6gfoB+pH6Efqh+iH6sfox+sH6QfrR+lH64fph+vH6cfuB+wH7kfsR+6H3Afux9xH7wfsx/IH3IfyR9z" +
        "H8ofdB/LH3UfzB/DH9gf0B/ZH9Ef2h92H9sfdx/oH+Af6R/hH+ofeh/rH3sf7B/lH/gfeB/5H3kf+h98H/sffR/8H/MfJiHJAyoh" +
        "awArIeUAMiFOIWAhcCFhIXEhYiFyIWMhcyFkIXQhZSF1IWYhdiFnIXchaCF4IWkheSFqIXohayF7IWwhfCFtIX0hbiF+IW8hfyGD" +
        "IYQhtiTQJLck0SS4JNIkuSTTJLok1CS7JNUkvCTWJL0k1yS+JNgkvyTZJMAk2iTBJNskwiTcJMMk3STEJN4kxSTfJMYk4CTHJOEk" +
        "yCTiJMkk4yTKJOQkyyTlJMwk5iTNJOckziToJM8k6SQALDAsASwxLAIsMiwDLDMsBCw0LAUsNSwGLDYsByw3LAgsOCwJLDksCiw6" +
        "LAssOywMLDwsDSw9LA4sPiwPLD8sECxALBEsQSwSLEIsEyxDLBQsRCwVLEUsFixGLBcsRywYLEgsGSxJLBosSiwbLEssHCxMLB0s" +
        "TSweLE4sHyxPLCAsUCwhLFEsIixSLCMsUywkLFQsJSxVLCYsViwnLFcsKCxYLCksWSwqLFosKyxbLCwsXCwtLF0sLixeLC8sXyxg" +
        "LGEsYixrAmMsfR1kLH0CZyxoLGksaixrLGwsbSxRAm4scQJvLFACcCxSAnIscyx1LHYsfiw/An8sQAKALIEsgiyDLIQshSyGLIcs" +
        "iCyJLIosiyyMLI0sjiyPLJAskSySLJMslCyVLJYslyyYLJksmiybLJwsnSyeLJ8soCyhLKIsoyykLKUspiynLKgsqSyqLKssrCyt" +
        "LK4sryywLLEssiyzLLQstSy2LLcsuCy5LLosuyy8LL0sviy/LMAswSzCLMMsxCzFLMYsxyzILMksyizLLMwszSzOLM8s0CzRLNIs" +
        "0yzULNUs1izXLNgs2SzaLNss3CzdLN4s3yzgLOEs4izjLOss7CztLO4s8izzLECmQaZCpkOmRKZFpkamR6ZIpkmmSqZLpkymTaZO" +
        "pk+mUKZRplKmU6ZUplWmVqZXplimWaZaplumXKZdpl6mX6ZgpmGmYqZjpmSmZaZmpmemaKZppmqma6Zspm2mgKaBpoKmg6aEpoWm" +
        "hqaHpoimiaaKpoumjKaNpo6mj6aQppGmkqaTppSmlaaWppemmKaZppqmm6YipyOnJKclpyanJ6copymnKqcrpyynLacupy+nMqcz" +
        "pzSnNac2pzenOKc5pzqnO6c8pz2nPqc/p0CnQadCp0OnRKdFp0anR6dIp0mnSqdLp0ynTadOp0+nUKdRp1KnU6dUp1WnVqdXp1in" +
        "Wadap1unXKddp16nX6dgp2GnYqdjp2SnZadmp2enaKdpp2qna6dsp22nbqdvp3mneqd7p3ynfad5HX6nf6eAp4GngqeDp4SnhaeG" +
        "p4eni6eMp42nZQKQp5GnkqeTp5anl6eYp5mnmqebp5ynnaeep5+noKehp6Kno6ekp6Wnpqenp6inqaeqp2YCq6dcAqynYQKtp2wC" +
        "rqdqArCnngKxp4cCsqedArOnU6u0p7Wntqe3p7inuae6p7unvKe9p76nv6fAp8GnwqfDp8SnlKfFp4ICxqeOHcenyKfJp8qny6dk" +
        "AsynzafQp9Gn1qfXp9in2afap9un3KebAfWn9qch/0H/Iv9C/yP/Q/8k/0T/Jf9F/yb/Rv8n/0f/KP9I/yn/Sf8q/0r/K/9L/yz/" +
        "TP8t/03/Lv9O/y//T/8w/1D/Mf9R/zL/Uv8z/1P/NP9U/zX/Vf82/1b/N/9X/zj/WP85/1n/Ov9a/w==";

    private static readonly Dictionary<char, char> ExtraLowercase = LoadLowercasePairs();

    internal static char Fold(char unit) => ExtraLowercase.TryGetValue(unit, out var lower) ? lower : unit;

    private static Dictionary<char, char> LoadLowercasePairs() {
        var bytes = Convert.FromBase64String(LowercasePairs);
        var pairs = new Dictionary<char, char>(bytes.Length / 4);
        for (int i = 0; i < bytes.Length; i += 4) {
            var source = (char)(bytes[i] | bytes[i + 1] << 8);
            var lower = (char)(bytes[i + 2] | bytes[i + 3] << 8);
            pairs.Add(source, lower);
        }
        return pairs;
    }
}
