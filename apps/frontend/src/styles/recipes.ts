import { cva, type RecipeVariantProps } from "../../styled-system/css";

/**
 * カードスタイルのレシピ
 */
export const cardRecipe = cva({
  base: {
    bg: "bg.card",
    borderRadius: "lg",
    p: 4,
    transition: "all 0.2s",
  },
  variants: {
    variant: {
      default: {
        border: "1px solid",
        borderColor: "border",
      },
      elevated: {
        boxShadow: "md",
        border: "1px solid",
        borderColor: "border",
        _hover: {
          boxShadow: "lg",
          transform: "translateY(-2px)",
        },
      },
      outlined: {
        border: "2px solid",
        borderColor: "accent",
      },
    },
    padding: {
      sm: { p: 2 },
      md: { p: 4 },
      lg: { p: 6 },
    },
  },
  defaultVariants: {
    variant: "default",
    padding: "md",
  },
});

export type CardRecipeProps = RecipeVariantProps<typeof cardRecipe>;

/**
 * バッジスタイルのレシピ
 */
export const badgeRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    px: 3,
    py: 1,
    borderRadius: "full",
    fontSize: "xs",
    fontWeight: "500",
    transition: "all 0.2s",
  },
  variants: {
    variant: {
      primary: {
        bg: "vrc.primary",
        color: "white",
      },
      secondary: {
        bg: "vrc.secondary",
        color: "white",
      },
      success: {
        bg: "vrc.success",
        color: "white",
      },
      warning: {
        bg: "vrc.warning",
        color: "white",
      },
      error: {
        bg: "vrc.error",
        color: "white",
      },
      muted: {
        bg: "bg.hover",
        color: "text.muted",
      },
    },
  },
  defaultVariants: {
    variant: "muted",
  },
});

export type BadgeRecipeProps = RecipeVariantProps<typeof badgeRecipe>;

/**
 * ボタンスタイルのレシピ
 */
export const buttonRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    px: 4,
    py: 2,
    borderRadius: "md",
    fontSize: "sm",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s",
    border: "none",
    outline: "none",
    _disabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
  variants: {
    variant: {
      primary: {
        bg: "vrc.primary",
        color: "white",
        _hover: {
          bg: "vrc.secondary",
        },
      },
      secondary: {
        bg: "bg.card",
        color: "text",
        border: "1px solid",
        borderColor: "border",
        _hover: {
          bg: "bg.hover",
        },
      },
      ghost: {
        bg: "transparent",
        color: "text",
        _hover: {
          bg: "bg.hover",
        },
      },
    },
    size: {
      sm: { px: 3, py: 1, fontSize: "xs" },
      md: { px: 4, py: 2, fontSize: "sm" },
      lg: { px: 6, py: 3, fontSize: "md" },
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export type ButtonRecipeProps = RecipeVariantProps<typeof buttonRecipe>;

/**
 * 統計カードのレシピ
 */
export const statCardRecipe = cva({
  base: {
    textAlign: "center",
    p: 3,
    bg: "bg.card",
    borderRadius: "md",
    transition: "all 0.2s",
  },
  variants: {
    highlight: {
      true: {
        border: "2px solid",
        borderColor: "accent",
      },
      false: {
        border: "1px solid",
        borderColor: "border",
      },
    },
  },
  defaultVariants: {
    highlight: false,
  },
});

export type StatCardRecipeProps = RecipeVariantProps<typeof statCardRecipe>;
